import type { SearchVectorInput, VectorPoint, VectorProviderInfo } from './types/vector.types';

export const VECTOR_STORE = Symbol('VECTOR_STORE');

export interface VectorStore {
    getProviderInfo(): VectorProviderInfo;
    ensureIndex(): Promise<void>;
    upsertPoints(points: VectorPoint[]): Promise<void>;
    search(input: SearchVectorInput): Promise<VectorPoint[]>;
    deleteByDocumentId(documentId: number): Promise<void>;
}
