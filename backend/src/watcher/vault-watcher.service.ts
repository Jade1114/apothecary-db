import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from '@nestjs/common';
import { access } from 'node:fs/promises';
import type { FSWatcher } from 'node:fs';
import { basename, extname, isAbsolute, relative } from 'node:path';
import { ConfigService } from '../config/config.service';
import { SyncCoordinatorService } from '../sync-coordinator/sync-coordinator.service';
import {
    VAULT_WATCH_FACTORY,
    type VaultWatchFactory,
    type VaultWatchListener,
} from './watcher.types';

@Injectable()
export class VaultWatcherService
    implements OnApplicationBootstrap, OnApplicationShutdown
{
    private readonly logger = new Logger(VaultWatcherService.name);
    private readonly supportedExtensions = new Set([
        '.txt',
        '.md',
        '.pdf',
        '.docx',
    ]);
    private watcher: FSWatcher | null = null;
    private closed = false;

    constructor(
        private readonly configService: ConfigService,
        private readonly syncCoordinatorService: SyncCoordinatorService,
        @Inject(VAULT_WATCH_FACTORY)
        private readonly watchFactory: VaultWatchFactory,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (!this.configService.watcherEnabled) {
            this.logger.log('Vault watcher disabled');
            return;
        }

        await this.start();

        if (this.watcher) {
            this.syncCoordinatorService.requestScan('startup');
        }
    }

    onApplicationShutdown(): void {
        this.close();
    }

    async start(): Promise<void> {
        if (this.watcher) {
            return;
        }

        const vaultPath = this.configService.vaultPath;
        try {
            await access(vaultPath);
            this.closed = false;
            this.watcher = this.watchFactory(
                vaultPath,
                { recursive: true },
                this.handleWatchEvent,
            );
            this.watcher.on('error', (error) => {
                this.logger.error(
                    `Vault watcher error: ${this.getErrorMessage(error)}`,
                );
            });
            this.logger.log(`Watching vault changes: ${vaultPath}`);
        } catch (error) {
            this.logger.error(
                `Failed to start vault watcher: ${this.getErrorMessage(error)}`,
            );
            this.close();
        }
    }

    close(): void {
        this.closed = true;

        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }

    private readonly handleWatchEvent: VaultWatchListener = (
        eventType,
        filename,
    ): void => {
        const relativePath = this.normalizeWatchFilename(filename);

        if (this.shouldIgnoreWatchPath(relativePath)) {
            return;
        }

        this.syncCoordinatorService.requestScan(
            `${eventType}:${relativePath ?? 'unknown'}`,
        );
    };

    private normalizeWatchFilename(
        filename: string | Buffer | null,
    ): string | null {
        if (!filename) {
            return null;
        }

        const rawPath = Buffer.isBuffer(filename)
            ? filename.toString('utf8')
            : filename;
        const relativePath = isAbsolute(rawPath)
            ? relative(this.configService.vaultPath, rawPath)
            : rawPath;
        const normalizedPath = relativePath
            .replace(/\\/g, '/')
            .replace(/^\/+/, '');

        return normalizedPath.length > 0 ? normalizedPath : null;
    }

    private shouldIgnoreWatchPath(relativePath: string | null): boolean {
        if (!relativePath) {
            return false;
        }

        const segments = relativePath.split('/').filter(Boolean);
        if (segments.length === 0 || segments[0] === '..') {
            return true;
        }

        if (
            segments.some((segment) =>
                ['.apothecary', '.obsidian', 'node_modules'].includes(
                    segment.toLowerCase(),
                ),
            )
        ) {
            return true;
        }

        const fileName = basename(relativePath).toLowerCase();
        if (
            fileName === '.ds_store' ||
            fileName.startsWith('.~') ||
            fileName.startsWith('~') ||
            fileName.endsWith('~') ||
            fileName.endsWith('.tmp') ||
            fileName.endsWith('.swp') ||
            fileName.endsWith('.swx')
        ) {
            return true;
        }

        const extension = extname(fileName);
        return extension.length > 0 && !this.supportedExtensions.has(extension);
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
