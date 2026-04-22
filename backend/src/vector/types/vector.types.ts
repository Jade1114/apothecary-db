export type VectorPointPayload = Record<string, unknown>;

export type VectorPoint = {
    id: string;
    vector: number[];
    payload: VectorPointPayload;
};

export type SearchVectorInput = {
    queryVector: number[];
    limit?: number;
    filter?: Record<string, unknown>;
};

export type VectorProviderInfo = {
    url: string;
    collection: string;
    vectorSize: number;
};
