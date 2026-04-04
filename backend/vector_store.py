import json
import os
from typing import Any, Dict, List, Optional
from urllib import error, request


class VectorStoreError(Exception):
    pass


class VectorStore:
    def __init__(
        self,
        url: str,
        collection_name: str,
        vector_size: int,
        distance: str = "Cosine",
        api_key: Optional[str] = None,
        timeout: int = 30,
    ):
        self.url = url.rstrip("/")
        self.collection_name = collection_name
        self.vector_size = vector_size
        self.distance = distance
        self.api_key = api_key
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> "VectorStore":
        url = os.getenv("QDRANT_URL")
        if not url:
            raise VectorStoreError("缺少 QDRANT_URL")

        collection_name = os.getenv("QDRANT_COLLECTION") or "profile_chunks"
        vector_size_value = os.getenv("QDRANT_VECTOR_SIZE")
        if not vector_size_value:
            raise VectorStoreError("缺少 QDRANT_VECTOR_SIZE")

        try:
            vector_size = int(vector_size_value)
        except ValueError as exc:
            raise VectorStoreError("QDRANT_VECTOR_SIZE 必须是整数") from exc

        distance = os.getenv("QDRANT_DISTANCE") or "Cosine"
        api_key = os.getenv("QDRANT_API_KEY")
        timeout_value = os.getenv("QDRANT_TIMEOUT", "30")

        try:
            timeout = int(timeout_value)
        except ValueError as exc:
            raise VectorStoreError("QDRANT_TIMEOUT 必须是整数") from exc

        return cls(
            url=url,
            collection_name=collection_name,
            vector_size=vector_size,
            distance=distance,
            api_key=api_key,
            timeout=timeout,
        )

    def ensure_collection(self) -> None:
        body = {
            "vectors": {
                "size": self.vector_size,
                "distance": self.distance,
            }
        }
        self._request(
            method="PUT",
            path=f"/collections/{self.collection_name}",
            body=body,
        )

    def upsert_chunks(self, points: List[Dict[str, Any]]) -> None:
        if not points:
            return

        body = {
            "points": points,
        }
        self._request(
            method="PUT",
            path=f"/collections/{self.collection_name}/points",
            body=body,
        )

    def search(
        self,
        query_vector: List[float],
        document_id: int,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        body = {
            "vector": query_vector,
            "limit": limit,
            "with_payload": True,
            "filter": {
                "must": [
                    {
                        "key": "document_id",
                        "match": {"value": document_id},
                    }
                ]
            },
        }

        result = self._request(
            method="POST",
            path=f"/collections/{self.collection_name}/points/search",
            body=body,
        )
        points = result.get("result")
        if not isinstance(points, list):
            raise VectorStoreError("Qdrant search 响应缺少 result 列表")

        return points

    def delete_by_document(self, document_id: int) -> None:
        body = {
            "filter": {
                "must": [
                    {
                        "key": "document_id",
                        "match": {"value": document_id},
                    }
                ]
            }
        }
        self._request(
            method="POST",
            path=f"/collections/{self.collection_name}/points/delete",
            body=body,
        )

    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        data = None
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["api-key"] = self.api_key

        if body is not None:
            data = json.dumps(body).encode("utf-8")

        req = request.Request(
            url=f"{self.url}{path}",
            data=data,
            method=method,
            headers=headers,
        )

        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                response_body = response.read().decode("utf-8")
        except error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="ignore")
            if exc.code == 409 and "already exists" in error_body.lower():
                return {"status": "ok", "result": "already_exists"}
            raise VectorStoreError(
                f"Qdrant 请求失败: HTTP {exc.code} - {error_body}"
            ) from exc
        except error.URLError as exc:
            raise VectorStoreError(f"Qdrant 连接失败: {exc.reason}") from exc

        if not response_body:
            return {}

        try:
            result = json.loads(response_body)
        except json.JSONDecodeError as exc:
            raise VectorStoreError("Qdrant 返回了非法 JSON") from exc

        status = result.get("status")
        if status not in (None, "ok"):
            raise VectorStoreError(f"Qdrant 返回异常状态: {status}")

        return result
