import type { GenerateAnswerInput } from './types/llm.types';

export function buildRagAnswerPrompt(input: GenerateAnswerInput): string {
    const evidenceBlock = input.evidence.length > 0 ? input.evidence.map((item, index) => `${index + 1}. ${item}`).join('\n') : '无可用 evidence';

    return [
        '你是一个负责根据 evidence 生成简洁回答的助手。',
        '要求：',
        '1. 只能基于 evidence 作答，不要编造。',
        '2. 回答用中文。',
        '3. 如果 evidence 不足，就明确说信息不足。',
        '',
        `用户问题：${input.query}`,
        '',
        'evidence：',
        evidenceBlock,
        '',
        '请直接输出回答正文。',
    ].join('\n');
}
