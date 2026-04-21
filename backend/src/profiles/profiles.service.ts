import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type ProfileJson = Record<string, unknown>;

export type ProfileRecord = {
  id: number;
  document_id: number;
  summary: string;
  profile_json: ProfileJson;
  created_at: string;
};

type ProfileRow = {
  id: number;
  document_id: number;
  summary: string;
  profile_json: string;
  created_at: string;
};

@Injectable()
export class ProfilesService {
  constructor(private readonly databaseService: DatabaseService) {}

  listProfiles(): ProfileRecord[] {
    const database = this.databaseService.getDatabase();
    const rows = database
      .prepare(
        'SELECT id, document_id, summary, profile_json, created_at FROM profiles ORDER BY id DESC',
      )
      .all() as ProfileRow[];

    return rows.map((row) => ({
      ...row,
      profile_json: JSON.parse(row.profile_json) as ProfileJson,
    }));
  }

  getLatestProfile(): ProfileRecord | null {
    const database = this.databaseService.getDatabase();
    const row = database
      .prepare(
        'SELECT id, document_id, summary, profile_json, created_at FROM profiles ORDER BY id DESC LIMIT 1',
      )
      .get() as ProfileRow | undefined;

    if (!row) {
      return null;
    }

    return {
      ...row,
      profile_json: JSON.parse(row.profile_json) as ProfileJson,
    };
  }
}
