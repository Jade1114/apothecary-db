from typing import Dict, List

from embedding_service import EmbeddingService
from vector_store import VectorStore

DIMENSION_QUERIES: Dict[str, str] = {
    "技术兴趣": "找能体现该用户技术兴趣、技术栈偏好、技术投入方向和持续学习意愿的内容。",
    "关注话题": "找能体现该用户持续关注、反复讨论或重点思考的问题域、主题和实践议题的内容。",
    "表达风格": "找能体现该用户表达方式、沟通习惯、信息组织方式和语言风格特征的内容。",
}


class RetrieveFlow:
    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
    ):
        self.embedding_service = embedding_service
        self.vector_store = vector_store

    def retrieve_evidence(self, document_id: int, dimension_name: str, limit: int = 5) -> dict:
        query = DIMENSION_QUERIES.get(dimension_name)
        if not query:
            raise ValueError(f"不支持的画像维度: {dimension_name}")

        query_vector = self.embedding_service.embed_text(query)
        points = self.vector_store.search(
            query_vector=query_vector,
            document_id=document_id,
            limit=limit,
        )

        evidence = self._filter_evidence(points)
        return {
            "dimension": dimension_name,
            "query": query,
            "evidence": evidence,
        }

    def _filter_evidence(self, points: List[dict]) -> List[str]:
        evidence: List[str] = []
        for point in points:
            payload = point.get("payload") or {}
            content = str(payload.get("content", "")).strip()
            if not content:
                continue
            if self._looks_like_noise(content):
                continue
            evidence.append(content)

        return evidence

    def _looks_like_noise(self, content: str) -> bool:
        lowered = content.lower()
        noise_signals = ["trace", "warn", "error", "debug", "{", "}"]
        return any(signal in lowered for signal in noise_signals)
