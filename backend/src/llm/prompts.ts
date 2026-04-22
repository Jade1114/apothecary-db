import type { GenerateAnswerInput } from './types/llm.types';

export function buildRagSystemPrompt(): string {
    return [
        '你是一个严格基于 evidence 回答问题的助手。',
        '规则：',
        '1. 只能使用提供的 evidence，不要补充外部知识或主观推断。',
        '2. 回答使用中文，保持简洁清楚。',
        '3. 如果 evidence 不足，请明确回答“信息不足”。',
        '4. 如果 evidence 之间存在冲突，请明确指出冲突，不要自行编造结论。',
    ].join('\n');
}

export function buildRagAnswerPrompt(input: GenerateAnswerInput): string {
    const evidenceBlock =
        input.evidence.length > 0
            ? input.evidence.map((item, index) => `${index + 1}. ${item}`).join('\n')
            : '当前没有可用 evidence。';

    return [
        `用户问题：${input.query}`,
        '',
        'evidence：',
        evidenceBlock,
        '',
        '输出要求：',
        '1. 只回答当前问题，不要输出额外寒暄或解释。',
        '2. 优先使用最直接相关的 evidence 组织答案。',
        '3. 回答末尾附上使用到的 evidence 编号，例如：来源：[1][3]。',
        '4. 如果没有足够 evidence，直接回答“信息不足”。',
        '',
        '请直接输出答案正文。',
    ].join('\n');
}
