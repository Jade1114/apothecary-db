import re

from fastapi import FastAPI
from pydantic import BaseModel

from llm_service import PlaceholderLLMService
from storage import init_db, list_documents, list_profiles, save_document, save_profile

app = FastAPI()
llm_service = PlaceholderLLMService()
init_db()

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


@app.post("/profile")
def get_profile(request: ProfileRequest):
    chunks = split_into_chunks(request.content)
    matched_chunks = retrieve_tech_interest_chunks(chunks)
    matched_sentences = extract_relevant_sentences(matched_chunks)
    rule_based_profile = build_rule_based_profile(matched_sentences)
    generated_result = llm_service.generate_profile(matched_sentences)

    document_id = save_document(request.content)
    generated_profile = generated_result["profile"]
    profile_id = save_profile(document_id, generated_profile)

    return {
        "received": True,
        "length": len(request.content),
        "chunkCount": len(chunks),
        "chunks": chunks,
        "matchedChunkCount": len(matched_chunks),
        "matchedChunks": matched_chunks,
        "matchedSentenceCount": len(matched_sentences),
        "matchedSentences": matched_sentences,
        "keywords": TECH_INTEREST_KEYWORDS,
        "ruleBasedProfile": rule_based_profile,
        "generatedProfile": generated_profile,
        "generationMeta": {
            "provider": generated_result["provider"],
            "prompt": generated_result["prompt"],
        },
        "storage": {
            "documentId": document_id,
            "profileId": profile_id,
        },
    }
