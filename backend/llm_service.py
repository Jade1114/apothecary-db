from typing import Optional

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
                    "items": []
                },
                {
                    "name": "关注话题",
                    "description": "占位生成器输出，后续可替换为真实云模型结果",
                    "items": []
                },
                {
                    "name": "表达风格",
                    "description": "占位生成器输出，后续可替换为真实云模型结果",
                    "items": []
                }
            ]
        }


class PlaceholderLLMService:
    def __init__(self, generator: Optional[ProfileGenerator] = None):
        self.generator = generator or PlaceholderProfileGenerator()

    def generate_profile(self, evidence: list[str]) -> dict:
        prompt = build_profile_generation_prompt(evidence)
        profile = self.generator.generate(evidence)
        return {
            "provider": "placeholder",
            "prompt": prompt,
            "profile": profile,
        }
