from typing import Dict, List

from embedding_service import EmbeddingService
from vector_store import VectorStore

DIMENSION_QUERIES: Dict[str, str] = {
    "技术兴趣": "找能体现该用户技术兴趣、技术栈偏好、技术投入方向和持续学习意愿的内容。",
    "关注话题": "找能体现该用户持续关注、反复讨论或重点思考的问题域、主题和实践议题的内容。",
    "表达风格": "找能体现该用户表达方式、沟通习惯、信息组织方式和语言风格特征的内容。",
}

DIMENSION_PRIORITY_SIGNALS: Dict[str, List[str]] = {
    "技术兴趣": [
        "我喜欢",
        "我更偏",
        "我更倾向",
        "我感兴趣",
        "我在学",
        "我最近在学",
        "我想补",
        "我想做",
        "我希望",
        "我关注",
        "java",
        "python",
        "rag",
        "prompt",
        "后端",
        "并发",
        "数据库",
    ],
    "关注话题": [
        "我更关心",
        "我希望",
        "我不想",
        "我不喜欢",
        "我更希望",
        "我想让",
        "我在意",
        "我关注",
        "主链路",
        "工程落地",
        "项目驱动",
        "api",
        "画像",
        "检索",
        "结构化输出",
        "长期使用",
    ],
    "表达风格": [
        "我通常",
        "我比较",
        "我不喜欢",
        "我更希望",
        "我更在意",
        "我会",
        "我倾向于",
        "我希望跳过",
        "直接",
        "推进价值",
        "空泛",
        "低信息密度",
        "重复",
        "关键",
        "主链路",
        "跑通",
    ],
}

DIMENSION_NEGATIVE_SIGNALS: Dict[str, List[str]] = {
    "技术兴趣": ["可以", "是一种", "用于", "通过"],
    "关注话题": ["java", "python"],
    "表达风格": ["java", "python", "rag", "prompt", "数据库", "并发"],
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

        evidence = self._filter_evidence(points, dimension_name)
        return {
            "dimension": dimension_name,
            "query": query,
            "evidence": evidence,
        }

    def _filter_evidence(self, points: List[dict], dimension_name: str) -> List[str]:
        scored_items = []
        seen = set()

        for index, point in enumerate(points):
            payload = point.get("payload") or {}
            content = str(payload.get("content", "")).strip()
            if not content:
                continue
            if self._looks_like_noise(content):
                continue
            if content in seen:
                continue
            seen.add(content)

            score = self._score_evidence(content, dimension_name)
            scored_items.append((score, index, content))

        scored_items.sort(key=lambda item: (-item[0], item[1]))
        return [content for _, _, content in scored_items]

    def _score_evidence(self, content: str, dimension_name: str) -> int:
        lowered = content.lower()
        priority_signals = DIMENSION_PRIORITY_SIGNALS.get(dimension_name, [])
        negative_signals = DIMENSION_NEGATIVE_SIGNALS.get(dimension_name, [])

        score = 0
        for signal in priority_signals:
            if signal.lower() in lowered:
                score += 2

        for signal in negative_signals:
            if signal.lower() in lowered:
                score -= 1

        if "我" in content:
            score += 2

        return score

    def _looks_like_noise(self, content: str) -> bool:
        lowered = content.lower()
        noise_signals = ["trace", "warn", "error", "debug", "{", "}"]
        return any(signal in lowered for signal in noise_signals)
