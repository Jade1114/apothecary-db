import { Injectable } from '@nestjs/common';
import { join } from 'node:path';

@Injectable()
export class ConfigService {
  get port(): number {
    return Number(process.env.PORT ?? 3000);
  }

  get appName(): string {
    return process.env.APP_NAME ?? 'Apothecary DB';
  }

  get databasePath(): string {
    return process.env.DATABASE_PATH ?? join(process.cwd(), '..', 'data', 'app.db');
  }
}
