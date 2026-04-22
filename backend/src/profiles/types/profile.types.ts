export type ProfileJson = Record<string, unknown>;

export type ProfileRecord = {
    id: number;
    document_id: number;
    summary: string;
    profile_json: ProfileJson;
    created_at: string;
};

export type ProfilesListResponse = {
    profiles: ProfileRecord[];
};

export type CurrentProfileResponse = {
    profile: ProfileRecord | null;
};

export type ProfileDetailResponse = {
    profile: ProfileRecord;
};
