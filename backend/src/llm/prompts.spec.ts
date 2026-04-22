import { buildRagAnswerPrompt, buildRagSystemPrompt } from './prompts';

describe('llm prompts', () => {
    it('should keep stable system rules for rag answers', () => {
        expect(buildRagSystemPrompt()).toContain('只能使用提供的 evidence');
        expect(buildRagSystemPrompt()).toContain('如果 evidence 不足');
    });

    it('should build user prompt with numbered evidence and citation instruction', () => {
        const prompt = buildRagAnswerPrompt({
            query: '项目使用了什么后端框架？',
            evidence: ['backend 使用 NestJS', 'frontend 使用 React + Vite'],
        });

        expect(prompt).toContain('用户问题：项目使用了什么后端框架？');
        expect(prompt).toContain('1. backend 使用 NestJS');
        expect(prompt).toContain('2. frontend 使用 React + Vite');
        expect(prompt).toContain('回答末尾附上使用到的 evidence 编号');
    });

    it('should mention missing evidence when no context is available', () => {
        const prompt = buildRagAnswerPrompt({
            query: '当前有哪些模块？',
            evidence: [],
        });

        expect(prompt).toContain('当前没有可用 evidence。');
        expect(prompt).toContain('直接回答“信息不足”');
    });
});
