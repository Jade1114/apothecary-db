import type { SearchVectorInput, VectorPoint, VectorProviderInfo } from './types/vector.types';

export const VECTOR_STORE = Symbol('VECTOR_STORE');

export interface VectorStore {
    getProviderInfo(): VectorProviderInfo;
    ensureIndex(): void;
    upsertPoints(points: VectorPoint[]): void;
    search(input: SearchVectorInput): VectorPoint[];
    deleteByDocumentId(documentId: number): void;
    countPointsByDocumentId(documentId: number): number;
}
