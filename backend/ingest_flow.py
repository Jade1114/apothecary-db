from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional
from uuid import NAMESPACE_URL, uuid5

from embedding_service import EmbeddingService
from storage import save_document
from vector_store import VectorStore

Chunker = Callable[[str], List[str]]


class IngestFlow:
    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
        chunker: Chunker,
    ):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.chunker = chunker

    def ingest_document(
        self,
        content: str,
        source_type: str,
        source_name: Optional[str] = None,
    ) -> Dict[str, int]:
        cleaned_content = content.strip()
        if not cleaned_content:
            raise ValueError("ingest_document 不接受空内容")

        document_id = save_document(cleaned_content)
        chunks = self.chunker(cleaned_content)
        vectors = self.embedding_service.embed_texts(chunks)

        created_at = datetime.now(timezone.utc).isoformat()
        points = []
        for chunk_index, (chunk, vector) in enumerate(zip(chunks, vectors)):
            point_key = f"{source_type}:{document_id}:{chunk_index}"
            point_id = str(uuid5(NAMESPACE_URL, point_key))
            points.append(
                {
                    "id": point_id,
                    "vector": vector,
                    "payload": {
                        "document_id": document_id,
                        "source_type": source_type,
                        "source_name": source_name or "",
                        "chunk_index": chunk_index,
                        "content": chunk,
                        "created_at": created_at,
                    },
                }
            )

        self.vector_store.ensure_collection()
        self.vector_store.upsert_chunks(points)

        return {
            "document_id": document_id,
            "chunk_count": len(chunks),
        }
