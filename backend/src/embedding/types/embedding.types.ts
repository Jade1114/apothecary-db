export type EmbeddingVector = number[];

export type EmbedTextInput = {
    text: string;
};

export type EmbeddingProviderInfo = {
    provider: string;
    model: string;
    baseUrl: string;
};
