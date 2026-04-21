import json
import os
import re
from typing import Optional

from openai import OpenAI

from prompts import build_profile_generation_prompt


class ProfileGenerator:
    def generate(self, evidence: list[str]) -> dict:
        raise NotImplementedError


class PlaceholderProfileGenerator(ProfileGenerator):
    def generate(self, evidence: list[str]) -> dict:
        summary = "基于当前 evidence，已通过占位生成器完成画像生成链路联调。"
        if evidence:
            summary = f"基于当前 evidence，用户当前更突出地提到了：{evidence[0][:30]}。"

        return {
            "summary": summary,
            "dimensions": [
                {
                    "name": "技术兴趣",
                    "description": "占位生成器输出，后续可替换为真实云模型结果",
                    "items": [],
                },
                {
                    "name": "关注话题",
                    "description": "占位生成器输出，后续可替换为真实云模型结果",
                    "items": [],
                },
                {
                    "name": "表达风格",
                    "description": "占位生成器输出，后续可替换为真实云模型结果",
                    "items": [],
                },
            ],
        }


def extract_json_text(content: str) -> str:
    cleaned = content.strip()

    fenced_match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL)
    if fenced_match:
        return fenced_match.group(1).strip()

    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return cleaned[first_brace:last_brace + 1].strip()

    return cleaned


class KimiProfileGenerator(ProfileGenerator):
    def __init__(self, api_key: str, model: str, base_url: str):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model

    @classmethod
    def from_env(cls) -> Optional["KimiProfileGenerator"]:
        api_key = os.getenv("LLM_API_KEY")
        if not api_key:
            return None

        base_url = os.getenv("LLM_BASE_URL") or "https://api.moonshot.cn/v1"
        model = os.getenv("LLM_MODEL") or "kimi-k2.5"
        return cls(api_key=api_key, model=model, base_url=base_url)

    def generate(self, evidence: list[str]) -> dict:
        prompt = build_profile_generation_prompt(evidence)
        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": "你是 Kimi，由 Moonshot AI 提供的人工智能助手。你需要严格按照用户提供的结构要求输出合法 JSON，不要输出额外解释。",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=1,
        )

        content = completion.choices[0].message.content if completion.choices else None
        if not content:
            raise ValueError("Kimi 没有返回有效内容")

        json_text = extract_json_text(content)

        try:
            return json.loads(json_text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Kimi 返回的内容不是合法 JSON: {content}") from exc


class LLMService:
    def __init__(self, generator: Optional[ProfileGenerator] = None):
        self.generator = generator or KimiProfileGenerator.from_env() or PlaceholderProfileGenerator()
        self.provider = "placeholder"
        if isinstance(self.generator, KimiProfileGenerator):
            self.provider = "kimi"

    def generate_profile(self, evidence: list[str]) -> dict:
        prompt = build_profile_generation_prompt(evidence)
        profile = self.generator.generate(evidence)
        return {
            "provider": self.provider,
            "prompt": prompt,
            "profile": profile,
        }
