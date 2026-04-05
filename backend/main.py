import re
from typing import Dict, List

from env_loader import load_env_file

load_env_file()

from fastapi import FastAPI
from pydantic import BaseModel

from embedding_service import EmbeddingService
from ingest_flow import IngestFlow
from llm_service import LLMService
from retrieve_flow import RetrieveFlow
from storage import get_latest_profile, init_db, list_documents, list_profiles, save_document, save_profile
from vector_store import VectorStore

app = FastAPI()
llm_service = LLMService()
init_db()

embedding_service = None
vector_store = None
ingest_flow = None
retrieve_flow = None
rag_setup_error = None

try:
    embedding_service = EmbeddingService.from_env()
    vector_store = VectorStore.from_env()
    ingest_flow = IngestFlow(
        embedding_service=embedding_service,
        vector_store=vector_store,
        chunker=lambda content: split_into_chunks(content),
    )
    retrieve_flow = RetrieveFlow(
        embedding_service=embedding_service,
        vector_store=vector_store,
    )
except Exception as exc:
    rag_setup_error = str(exc)

TECH_INTEREST_KEYWORDS = [
    "Java",
    "Python",
    "React",
    "后端",
    "并发",
    "多线程",
    "数据库",
    "AI",
    "Prompt",
    "RAG",
]


class ProfileRequest(BaseModel):
    content: str


class IngestRequest(BaseModel):
    content: str
    sourceType: str = "text"
    sourceName: str | None = None


def split_into_chunks(content: str) -> list[str]:
    chunks = [chunk.strip() for chunk in content.split("\n\n")]
    return [chunk for chunk in chunks if chunk]


def retrieve_tech_interest_chunks(chunks: list[str]) -> list[str]:
    matched_chunks = []

    for chunk in chunks:
        if any(keyword.lower() in chunk.lower() for keyword in TECH_INTEREST_KEYWORDS):
            matched_chunks.append(chunk)

    return matched_chunks


def extract_relevant_sentences(chunks: list[str]) -> list[str]:
    matched_sentences = []

    for chunk in chunks:
        sentences = re.split(r"[。！？!?\n]", chunk)
        for sentence in sentences:
            cleaned_sentence = sentence.strip()
            if not cleaned_sentence:
                continue

            if any(keyword.lower() in cleaned_sentence.lower() for keyword in TECH_INTEREST_KEYWORDS):
                matched_sentences.append(cleaned_sentence)

    return matched_sentences


def build_rule_based_profile(matched_sentences: list[str]) -> dict:
    items = []

    for keyword in TECH_INTEREST_KEYWORDS:
        evidence = [
            sentence
            for sentence in matched_sentences
            if keyword.lower() in sentence.lower()
        ]

        if not evidence:
            continue

        items.append(
            {
                "keyword": keyword,
                "score": len(evidence),
                "reason": f"资料中有 {len(evidence)} 句内容提到了 {keyword} 相关信息。",
                "evidence": evidence,
            }
        )

    items.sort(key=lambda item: item["score"], reverse=True)

    summary = "基于当前资料，用户主要关注技术兴趣相关内容。"
    if items:
        top_keywords = [item["keyword"] for item in items[:3]]
        summary = f"基于当前资料，用户当前较突出的技术兴趣包括：{'、'.join(top_keywords)}。"

    return {
        "summary": summary,
        "dimensions": [
            {
                "name": "技术兴趣",
                "description": "基于资料提取的技术兴趣关键词",
                "items": items,
            }
        ],
    }


def deduplicate_evidence(groups: Dict[str, List[str]]) -> List[str]:
    ordered_evidence: List[str] = []
    seen = set()

    for evidence_list in groups.values():
        for evidence in evidence_list:
            cleaned = evidence.strip()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            ordered_evidence.append(cleaned)

    return ordered_evidence


def generate_profile_from_documents(documents: List[dict]) -> dict:
    rag_evidence_by_dimension: Dict[str, List[str]] = {
        "技术兴趣": [],
        "关注话题": [],
        "表达风格": [],
    }

    if retrieve_flow:
        for document in documents:
            document_id = int(document["id"])
            for dimension_name in rag_evidence_by_dimension.keys():
                retrieve_result = retrieve_flow.retrieve_evidence(
                    document_id=document_id,
                    dimension_name=dimension_name,
                    limit=5,
                )
                rag_evidence_by_dimension[dimension_name].extend(retrieve_result["evidence"])

    combined_evidence = deduplicate_evidence(rag_evidence_by_dimension)
    generated_result = llm_service.generate_profile(combined_evidence)
    generated_profile = generated_result["profile"]
    latest_document_id = int(documents[0]["id"]) if documents else 0
    profile_id = save_profile(latest_document_id, generated_profile)

    return {
        "generatedProfile": generated_profile,
        "generationMeta": {
            "provider": generated_result["provider"],
            "prompt": generated_result["prompt"],
            "ragEnabled": ingest_flow is not None and retrieve_flow is not None,
            "ragSetupError": rag_setup_error,
        },
        "retrieval": {
            "byDimension": rag_evidence_by_dimension,
            "combinedEvidence": combined_evidence,
        },
        "storage": {
            "profileId": profile_id,
            "documentId": latest_document_id,
        },
    }


@app.get("/")
def read_root():
    return {"message": "hello"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/documents")
def get_documents():
    return {"documents": list_documents()}


@app.get("/profiles")
def get_profiles():
    return {"profiles": list_profiles()}


@app.get("/profile/current")
def get_current_profile():
    profile = get_latest_profile()
    return {"profile": profile}


@app.post("/ingest")
def ingest_content(request: IngestRequest):
    chunks = split_into_chunks(request.content)

    if ingest_flow:
        ingest_result = ingest_flow.ingest_document(
            content=request.content,
            source_type=request.sourceType,
            source_name=request.sourceName,
        )
        return {
            "success": True,
            "documentId": ingest_result["document_id"],
            "chunkCount": ingest_result["chunk_count"],
            "sourceType": request.sourceType,
            "sourceName": request.sourceName,
        }

    document_id = save_document(request.content)
    return {
        "success": True,
        "documentId": document_id,
        "chunkCount": len(chunks),
        "sourceType": request.sourceType,
        "sourceName": request.sourceName,
        "warning": rag_setup_error,
    }


@app.post("/profile/generate")
def generate_profile():
    documents = list_documents()
    if not documents:
        return {
            "generatedProfile": None,
            "generationMeta": {
                "provider": llm_service.provider,
                "ragEnabled": ingest_flow is not None and retrieve_flow is not None,
                "ragSetupError": rag_setup_error,
            },
            "retrieval": {
                "byDimension": {},
                "combinedEvidence": [],
            },
            "storage": None,
        }

    return generate_profile_from_documents(documents)


@app.post("/profile")
def get_profile(request: ProfileRequest):
    chunks = split_into_chunks(request.content)
    matched_chunks = retrieve_tech_interest_chunks(chunks)
    matched_sentences = extract_relevant_sentences(matched_chunks)
    rule_based_profile = build_rule_based_profile(matched_sentences)

    ingest_result = ingest_content(
        IngestRequest(
            content=request.content,
            sourceType="text",
            sourceName=None,
        )
    )
    generated_result = generate_profile_from_documents([{"id": ingest_result["documentId"]}])

    return {
        "received": True,
        "length": len(request.content),
        "chunkCount": ingest_result["chunkCount"],
        "chunks": chunks,
        "matchedChunkCount": len(matched_chunks),
        "matchedChunks": matched_chunks,
        "matchedSentenceCount": len(matched_sentences),
        "matchedSentences": matched_sentences,
        "keywords": TECH_INTEREST_KEYWORDS,
        "ruleBasedProfile": rule_based_profile,
        "generatedProfile": generated_result["generatedProfile"],
        "generationMeta": generated_result["generationMeta"],
        "retrieval": generated_result["retrieval"],
        "storage": generated_result["storage"],
    }
