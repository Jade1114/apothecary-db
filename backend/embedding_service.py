import os
from typing import List, Optional

from openai import OpenAI


class EmbeddingServiceError(Exception):
    pass


class EmbeddingService:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: Optional[str] = None,
        timeout: int = 30,
    ):
        self.api_key = api_key
        self.model = model
        self.base_url = (base_url or "https://aihubmix.com/v1").rstrip("/")
        self.timeout = timeout
        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=self.timeout,
        )

    @classmethod
    def from_env(cls) -> "EmbeddingService":
        api_key = os.getenv("EMBEDDING_API_KEY") or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise EmbeddingServiceError("缺少 EMBEDDING_API_KEY 或 OPENAI_API_KEY")

        model = os.getenv("EMBEDDING_MODEL") or "text-embedding-3-small"
        base_url = os.getenv("EMBEDDING_BASE_URL") or os.getenv("OPENAI_BASE_URL") or "https://aihubmix.com/v1"
        timeout_value = os.getenv("EMBEDDING_TIMEOUT", "30")

        try:
            timeout = int(timeout_value)
        except ValueError as exc:
            raise EmbeddingServiceError("EMBEDDING_TIMEOUT 必须是整数") from exc

        return cls(
            api_key=api_key,
            model=model,
            base_url=base_url,
            timeout=timeout,
        )

    def embed_text(self, text: str) -> List[float]:
        cleaned_text = text.strip()
        if not cleaned_text:
            raise EmbeddingServiceError("embed_text 不接受空文本")

        embeddings = self.embed_texts([cleaned_text])
        if not embeddings:
            raise EmbeddingServiceError("embedding API 没有返回结果")

        return embeddings[0]

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            raise EmbeddingServiceError("embed_texts 不接受空列表")

        cleaned_texts = []
        for text in texts:
            cleaned_text = text.strip()
            if not cleaned_text:
                raise EmbeddingServiceError("embed_texts 中存在空文本")
            cleaned_texts.append(cleaned_text)

        try:
            response = self.client.embeddings.create(
                input=cleaned_texts,
                model=self.model,
            )
        except Exception as exc:
            raise EmbeddingServiceError(f"embedding API 调用失败: {exc}") from exc

        data = getattr(response, "data", None)
        if not isinstance(data, list):
            raise EmbeddingServiceError("embedding API 响应缺少 data 列表")

        embeddings: List[List[float]] = []
        for item in data:
            embedding = getattr(item, "embedding", None)
            if not isinstance(embedding, list):
                raise EmbeddingServiceError("embedding API 响应中的 embedding 字段格式错误")
            embeddings.append(embedding)

        if len(embeddings) != len(cleaned_texts):
            raise EmbeddingServiceError("embedding 返回数量与输入文本数量不一致")

        return embeddings
