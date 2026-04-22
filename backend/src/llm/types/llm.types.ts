export type LlmProviderInfo = {
    provider: string;
    model: string;
    baseUrl: string;
};

export type GenerateAnswerInput = {
    query: string;
    evidence: string[];
};
