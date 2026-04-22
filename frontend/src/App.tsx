import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';

type IngestResponse = {
    success: true;
    documentId: number;
    chunkCount: number;
    sourceType: string;
    sourceName: string | null;
    indexing: {
        embeddingReady: true;
        vectorReady: true;
        indexedPoints: number;
    };
};

type VaultScanItem = {
    filePath: string;
    success: boolean;
    result?: {
        sourceName: string | null;
        sourcePath: string;
        normalizedPath: string;
        title: string | null;
        chunkCount: number;
    };
    error?: string;
};

type VaultScanResponse = {
    vaultPath: string;
    scannedCount: number;
    importedCount: number;
    failedCount: number;
    items: VaultScanItem[];
};

type RagEvidenceItem = {
    id: string;
    documentId: number | null;
    chunkIndex: number | null;
    content: string;
    sourceType: string | null;
    sourceName: string | null;
};

type RagQueryResponse = {
    query: string;
    answer: string;
    evidence: RagEvidenceItem[];
    retrieval: {
        limit: number;
        matchedCount: number;
    };
    generation: {
        answered: boolean;
    };
};

async function postJson<T>(url: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    return (await response.json()) as T;
}

function App() {
    const [ingestContent, setIngestContent] = useState('我正在把这个项目重构成 TypeScript 全栈桌面应用。\n\n后端使用 NestJS，当前目标是先把 RAG 主链路跑通。');
    const [query, setQuery] = useState('这个项目当前后端做到哪里了');
    const [sourceName, setSourceName] = useState('frontend-manual');
    const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null);
    const [vaultScanResult, setVaultScanResult] = useState<VaultScanResponse | null>(null);
    const [ragResult, setRagResult] = useState<RagQueryResponse | null>(null);
    const [ingestLoading, setIngestLoading] = useState(false);
    const [scanLoading, setScanLoading] = useState(false);
    const [queryLoading, setQueryLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canIngest = useMemo(() => ingestContent.trim().length > 0, [ingestContent]);
    const canQuery = useMemo(() => query.trim().length > 0, [query]);

    async function handleIngest(event: FormEvent) {
        event.preventDefault();
        if (!canIngest) {
            return;
        }

        try {
            setError(null);
            setIngestLoading(true);
            const result = await postJson<IngestResponse>('/ingest', {
                content: ingestContent,
                sourceType: 'note',
                sourceName,
            });
            setIngestResult(result);
        } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : '资料入库失败');
        } finally {
            setIngestLoading(false);
        }
    }

    async function handleVaultScan() {
        try {
            setError(null);
            setScanLoading(true);
            const result = await postJson<VaultScanResponse>('/ingest/vault-scan');
            setVaultScanResult(result);
        } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : 'Vault 扫描失败');
        } finally {
            setScanLoading(false);
        }
    }

    async function handleQuery(event: FormEvent) {
        event.preventDefault();
        if (!canQuery) {
            return;
        }

        try {
            setError(null);
            setQueryLoading(true);
            const result = await postJson<RagQueryResponse>('/rag/query', {
                query,
                limit: 5,
            });
            setRagResult(result);
        } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : 'RAG 查询失败');
        } finally {
            setQueryLoading(false);
        }
    }

    return (
        <main className="app-shell">
            <header className="page-header">
                <div>
                    <p className="eyebrow">Apothecary DB</p>
                    <h1>RAG 工作台</h1>
                    <p className="subtitle">现在先从 Vault 手动扫描开始，把文件导入链路跑通，再继续往自动同步推进。</p>
                </div>
            </header>

            {error ? <div className="error-banner">{error}</div> : null}

            <section className="panel-grid panel-grid-three">
                <section className="panel">
                    <div className="panel-header">
                        <h2>扫描 Vault</h2>
                        <p>手动触发扫描 `~/Apothecary-Vault`，导入其中支持的文本与富文本文件。</p>
                    </div>
                    <div className="panel-form">
                        <button type="button" onClick={handleVaultScan} disabled={scanLoading}>
                            {scanLoading ? '扫描中…' : '扫描并导入 Vault'}
                        </button>
                    </div>

                    <div className="result-card">
                        <h3>扫描结果</h3>
                        {vaultScanResult ? (
                            <div className="scan-result">
                                <p>
                                    Vault：<code>{vaultScanResult.vaultPath}</code>
                                </p>
                                <p>
                                    扫描 {vaultScanResult.scannedCount} 个文件，成功 {vaultScanResult.importedCount} 个，失败 {vaultScanResult.failedCount} 个。
                                </p>
                                <pre>{JSON.stringify(vaultScanResult.items.slice(0, 20), null, 4)}</pre>
                            </div>
                        ) : (
                            <p>还没有执行 Vault 扫描。</p>
                        )}
                    </div>
                </section>

                <section className="panel">
                    <div className="panel-header">
                        <h2>手动文本入库</h2>
                        <p>这块暂时保留用于调试，主线已经转向 Vault 文件导入。</p>
                    </div>
                    <form className="panel-form" onSubmit={handleIngest}>
                        <label>
                            <span>来源名称</span>
                            <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
                        </label>
                        <label>
                            <span>资料内容</span>
                            <textarea value={ingestContent} onChange={(event) => setIngestContent(event.target.value)} rows={10} />
                        </label>
                        <button type="submit" disabled={!canIngest || ingestLoading}>
                            {ingestLoading ? '入库中…' : '提交到 /ingest'}
                        </button>
                    </form>

                    <div className="result-card">
                        <h3>入库结果</h3>
                        {ingestResult ? <pre>{JSON.stringify(ingestResult, null, 4)}</pre> : <p>还没有提交资料。</p>}
                    </div>
                </section>

                <section className="panel">
                    <div className="panel-header">
                        <h2>RAG 查询</h2>
                        <p>基于当前 sqlite-vec 中的向量数据做 evidence 检索并生成回答。</p>
                    </div>
                    <form className="panel-form" onSubmit={handleQuery}>
                        <label>
                            <span>问题</span>
                            <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={5} />
                        </label>
                        <button type="submit" disabled={!canQuery || queryLoading}>
                            {queryLoading ? '查询中…' : '提交到 /rag/query'}
                        </button>
                    </form>

                    <div className="result-card">
                        <h3>查询结果</h3>
                        {ragResult ? <pre>{JSON.stringify(ragResult, null, 4)}</pre> : <p>还没有发起查询。</p>}
                    </div>
                </section>
            </section>
        </main>
    );
}

export default App;
