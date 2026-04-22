import { Module } from '@nestjs/common';
import { SqliteVecVectorStore } from './sqlite-vec.vector-store';
import { VECTOR_STORE } from './vector-store';

@Module({
    providers: [
        SqliteVecVectorStore,
        {
            provide: VECTOR_STORE,
            useExisting: SqliteVecVectorStore,
        },
    ],
    exports: [VECTOR_STORE, SqliteVecVectorStore],
})
export class VectorModule {}
