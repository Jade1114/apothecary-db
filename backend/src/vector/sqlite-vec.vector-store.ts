import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '../config/config.service';
import type { SearchVectorInput, VectorPoint, VectorProviderInfo } from './types/vector.types';
import type { VectorStore } from './vector-store';

const SQLITE_VEC_TABLE = 'chunk_embeddings';

@Injectable()
export class SqliteVecVectorStore implements VectorStore {
    constructor(
        private readonly configService: ConfigService,
        private readonly databaseService: DatabaseService,
    ) {}

    getProviderInfo(): VectorProviderInfo {
        return {
            url: this.configService.databasePath,
            collection: SQLITE_VEC_TABLE,
            vectorSize: this.configService.vectorDimension,
        };
    }

    async ensureIndex(): Promise<void> {
        const database = this.databaseService.getDatabase();
        database.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS ${SQLITE_VEC_TABLE}
            USING vec0(embedding float[${this.configService.vectorDimension}]);
        `);
    }

    async upsertPoints(points: VectorPoint[]): Promise<void> {
        if (points.length === 0) {
            return;
        }

        await this.ensureIndex();
        const database = this.databaseService.getDatabase();
        const deleteStatement = database.prepare(`DELETE FROM ${SQLITE_VEC_TABLE} WHERE rowid = ?`);

        for (const point of points) {
            const chunkId = this.getChunkId(point);
            deleteStatement.run(chunkId);
            database.prepare(
                `INSERT INTO ${SQLITE_VEC_TABLE}(rowid, embedding) VALUES (${chunkId}, ?)`,
            ).run(JSON.stringify(point.vector));
        }
    }

    async search(input: SearchVectorInput): Promise<VectorPoint[]> {
        if (input.queryVector.length === 0) {
            throw new Error('search 不接受空 queryVector');
        }

        await this.ensureIndex();
        const database = this.databaseService.getDatabase();
        const limit = input.limit ?? 5;
        const rows = database
            .prepare(
                `
                SELECT
                    vec.rowid AS chunk_id,
                    vec.distance AS distance,
                    chunks.document_id AS document_id,
                    chunks.chunk_index AS chunk_index,
                    chunks.content AS content,
                    documents.source_type AS source_type,
                    documents.source_name AS source_name
                FROM ${SQLITE_VEC_TABLE} AS vec
                JOIN chunks ON chunks.id = vec.rowid
                JOIN documents ON documents.id = chunks.document_id
                WHERE vec.embedding MATCH ?
                ORDER BY vec.distance ASC
                LIMIT ?
                `,
            )
            .all(
                Buffer.from(new Float32Array(input.queryVector).buffer),
                limit,
            ) as Array<Record<string, unknown>>;

        return rows.map((row) => ({
            id: String(row.chunk_id),
            vector: [],
            payload: {
                chunkId: row.chunk_id,
                documentId: row.document_id,
                chunkIndex: row.chunk_index,
                content: row.content,
                sourceType: row.source_type,
                sourceName: row.source_name,
                distance: row.distance,
            },
        }));
    }

    async deleteByDocumentId(documentId: number): Promise<void> {
        await this.ensureIndex();
        const database = this.databaseService.getDatabase();
        const rows = database
            .prepare('SELECT id FROM chunks WHERE document_id = ?')
            .all(documentId) as Array<{ id: number }>;

        const deleteStatement = database.prepare(`DELETE FROM ${SQLITE_VEC_TABLE} WHERE rowid = ?`);
        for (const row of rows) {
            deleteStatement.run(row.id);
        }
    }

    private getChunkId(point: VectorPoint): number {
        const value = point.payload.chunkId;
        if (typeof value !== 'number' || !Number.isInteger(value)) {
            throw new Error('SqliteVecVectorStore 需要 payload.chunkId 作为整数主键');
        }

        return value;
    }
}
