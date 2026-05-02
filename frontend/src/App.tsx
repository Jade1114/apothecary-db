import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import './App.css';

type DocumentRecord = {
    id: number;
    file_id?: number | null;
    plain_text: string;
    source_type?: string | null;
    source_name?: string | null;
    title?: string | null;
    source_path?: string | null;
    normalized_path?: string | null;
    parser_name?: string | null;
    parser_version?: string | null;
    parse_status: 'ready' | 'stale' | 'failed';
    index_status: 'ready' | 'stale' | 'failed';
    created_at: string;
    updated_at: string;
};

type DocumentListItem = Omit<DocumentRecord, 'plain_text'>;

type DocumentsListResponse = {
    documents: DocumentListItem[];
};

type DocumentDetailResponse = {
    document: DocumentRecord;
};

type VaultScanItem = {
    fileId: number;
    filePath: string;
    event: 'new' | 'changed' | 'unchanged' | 'deleted';
    action: 'indexed' | 'skipped' | 'deleted';
    success: boolean;
    error?: string;
};

type VaultScanResponse = {
    vaultPath: string;
    scannedCount: number;
    reconciledCount: number;
    importedCount: number;
    skippedCount: number;
    deletedCount: number;
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

type SyncState = 'idle' | 'syncing' | 'failed';

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    return (await response.json()) as T;
}

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
    const [documents, setDocuments] = useState<DocumentListItem[]>([]);
    const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
    const [selectedDocument, setSelectedDocument] = useState<DocumentRecord | null>(null);
    const [query, setQuery] = useState('这个知识库里现在有什么内容');
    const [ragResult, setRagResult] = useState<RagQueryResponse | null>(null);
    const [lastScanResult, setLastScanResult] = useState<VaultScanResponse | null>(null);
    const [documentsLoading, setDocumentsLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailRefreshKey, setDetailRefreshKey] = useState(0);
    const [syncState, setSyncState] = useState<SyncState>('idle');
    const [queryLoading, setQueryLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedTitle = selectedDocument ? getDocumentTitle(selectedDocument) : '未选择文档';
    const canQuery = useMemo(() => query.trim().length > 0, [query]);
    const scanSummary = useMemo(() => buildScanSummary(lastScanResult), [lastScanResult]);

    const loadDocuments = useCallback(
        async (preferredDocumentId?: number | null) => {
            setDocumentsLoading(true);
            try {
                const result = await getJson<DocumentsListResponse>('/documents');
                setDocuments(result.documents);

                const preferred = preferredDocumentId
                    ? result.documents.find((document) => document.id === preferredDocumentId)
                    : null;
                const nextSelected = preferred ?? result.documents[0] ?? null;
                setSelectedDocumentId(nextSelected?.id ?? null);
                setDetailRefreshKey((value) => value + 1);
            } catch (caughtError) {
                setError(caughtError instanceof Error ? caughtError.message : '文档列表加载失败');
            } finally {
                setDocumentsLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        let ignored = false;

        async function loadInitialDocuments() {
            try {
                const result = await getJson<DocumentsListResponse>('/documents');
                if (!ignored) {
                    setDocuments(result.documents);
                    setSelectedDocumentId(result.documents[0]?.id ?? null);
                }
            } catch (caughtError) {
                if (!ignored) {
                    setError(caughtError instanceof Error ? caughtError.message : '文档列表加载失败');
                }
            }
        }

        void loadInitialDocuments();

        return () => {
            ignored = true;
        };
    }, []);

    useEffect(() => {
        let ignored = false;

        async function loadSelectedDocument() {
            if (!selectedDocumentId) {
                setSelectedDocument(null);
                return;
            }

            setDetailLoading(true);
            try {
                const result = await getJson<DocumentDetailResponse>(`/documents/${selectedDocumentId}`);
                if (!ignored) {
                    setSelectedDocument(result.document);
                }
            } catch (caughtError) {
                if (!ignored) {
                    setError(caughtError instanceof Error ? caughtError.message : '文档详情加载失败');
                    setSelectedDocument(null);
                }
            } finally {
                if (!ignored) {
                    setDetailLoading(false);
                }
            }
        }

        void loadSelectedDocument();

        return () => {
            ignored = true;
        };
    }, [selectedDocumentId, detailRefreshKey]);

    async function handleRefreshDocuments() {
        setError(null);
        await loadDocuments(selectedDocumentId);
    }

    async function handleVaultScan() {
        try {
            setError(null);
            setSyncState('syncing');
            const result = await postJson<VaultScanResponse>('/ingest/vault-scan');
            setLastScanResult(result);
            setSyncState(result.failedCount > 0 ? 'failed' : 'idle');
            await loadDocuments(selectedDocumentId);
        } catch (caughtError) {
            setSyncState('failed');
            setError(caughtError instanceof Error ? caughtError.message : 'Vault 同步失败');
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
        <main className="workspace-shell">
            <header className="workspace-header">
                <div className="brand-lockup">
                    <span className="brand-mark" aria-hidden="true">
                        <Icon name="vault" />
                    </span>
                    <div>
                        <p className="eyebrow">Apothecary DB</p>
                        <h1>Vault Workspace</h1>
                    </div>
                </div>

                <div className="toolbar" aria-label="Vault controls">
                    <span className={`sync-pill sync-pill-${syncState}`}>
                        <span className="status-dot" aria-hidden="true" />
                        {syncState === 'syncing' ? '同步中' : syncState === 'failed' ? '有失败' : '就绪'}
                    </span>
                    <button
                        className="icon-button"
                        type="button"
                        onClick={handleRefreshDocuments}
                        disabled={documentsLoading}
                        title="刷新文档"
                    >
                        <Icon name="refresh" />
                    </button>
                    <button
                        className="primary-action"
                        type="button"
                        onClick={handleVaultScan}
                        disabled={syncState === 'syncing'}
                    >
                        <Icon name="sync" />
                        {syncState === 'syncing' ? '同步中' : '同步 Vault'}
                    </button>
                </div>
            </header>

            {error ? <div className="error-banner">{error}</div> : null}

            <section className="metrics-strip" aria-label="Workspace metrics">
                <Metric label="文档" value={documents.length} />
                <Metric label="本次扫描" value={lastScanResult?.scannedCount ?? '-'} />
                <Metric label="索引" value={lastScanResult?.importedCount ?? '-'} />
                <Metric label="删除" value={lastScanResult?.deletedCount ?? '-'} />
                <Metric label="失败" value={lastScanResult?.failedCount ?? '-'} tone={lastScanResult?.failedCount ? 'danger' : 'normal'} />
            </section>

            <section className="workspace-grid">
                <aside className="documents-pane" aria-label="Documents">
                    <div className="pane-header">
                        <h2>Documents</h2>
                        <span>{documentsLoading ? '加载中' : `${documents.length} items`}</span>
                    </div>

                    <div className="document-list">
                        {documents.length > 0 ? (
                            documents.map((document) => (
                                <button
                                    key={document.id}
                                    className={`document-row ${document.id === selectedDocumentId ? 'document-row-active' : ''}`}
                                    type="button"
                                    onClick={() => setSelectedDocumentId(document.id)}
                                >
                                    <span className="document-title">{getDocumentTitle(document)}</span>
                                    <span className="document-path">{getDocumentPathLabel(document)}</span>
                                    <span className="document-meta">
                                        {document.source_type ?? 'unknown'} · {document.parse_status}/{document.index_status}
                                    </span>
                                </button>
                            ))
                        ) : (
                            <div className="empty-state">
                                <Icon name="file" />
                                <p>{documentsLoading ? '加载中' : '暂无文档'}</p>
                            </div>
                        )}
                    </div>
                </aside>

                <section className="reader-pane" aria-label="Selected document">
                    <div className="pane-header">
                        <div>
                            <h2>{selectedTitle}</h2>
                            <p>{selectedDocument ? getDocumentPathLabel(selectedDocument) : 'No document selected'}</p>
                        </div>
                        {selectedDocument ? (
                            <span className="status-badge">
                                {selectedDocument.parse_status}/{selectedDocument.index_status}
                            </span>
                        ) : null}
                    </div>

                    <article className="document-reader">
                        {detailLoading ? (
                            <div className="loading-block">加载中</div>
                        ) : selectedDocument ? (
                            <pre>{selectedDocument.plain_text}</pre>
                        ) : (
                            <div className="empty-state empty-state-large">
                                <Icon name="file" />
                                <p>选择一个文档</p>
                            </div>
                        )}
                    </article>
                </section>

                <aside className="rag-pane" aria-label="RAG query">
                    <form className="query-box" onSubmit={handleQuery}>
                        <div className="pane-header">
                            <h2>Ask</h2>
                            <span>{ragResult ? `${ragResult.retrieval.matchedCount} matches` : 'RAG'}</span>
                        </div>
                        <label className="query-input">
                            <span>Query</span>
                            <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={5} />
                        </label>
                        <button className="primary-action full-width" type="submit" disabled={!canQuery || queryLoading}>
                            <Icon name="spark" />
                            {queryLoading ? '检索中' : '检索回答'}
                        </button>
                    </form>

                    <section className="answer-panel" aria-label="Answer">
                        <h3>Answer</h3>
                        {ragResult ? <p>{ragResult.answer}</p> : <p className="muted">{scanSummary}</p>}
                    </section>

                    <section className="evidence-list" aria-label="Evidence">
                        <h3>Evidence</h3>
                        {ragResult?.evidence.length ? (
                            ragResult.evidence.map((item) => (
                                <article className="evidence-item" key={item.id}>
                                    <div className="evidence-meta">
                                        <span>{item.sourceName ?? `Document ${item.documentId ?? '-'}`}</span>
                                        <span>chunk {item.chunkIndex ?? '-'}</span>
                                    </div>
                                    <p>{item.content}</p>
                                </article>
                            ))
                        ) : (
                            <p className="muted">No evidence yet</p>
                        )}
                    </section>
                </aside>
            </section>
        </main>
    );
}

function Metric({
    label,
    value,
    tone = 'normal',
}: {
    label: string;
    value: number | string;
    tone?: 'normal' | 'danger';
}) {
    return (
        <div className={`metric metric-${tone}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function Icon({ name }: { name: 'file' | 'refresh' | 'spark' | 'sync' | 'vault' }) {
    const paths = {
        file: (
            <>
                <path d="M6.75 3.5h5.35l4.15 4.2v8.8a2 2 0 0 1-2 2h-7.5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
                <path d="M11.85 3.75v3.45a1 1 0 0 0 1 1h3.35" />
                <path d="M7.8 12h5.9M7.8 15h4.2" />
            </>
        ),
        refresh: (
            <>
                <path d="M16.2 7.7a5.9 5.9 0 0 0-10.1-2.1L4.5 7.2" />
                <path d="M4.2 4.2v3.4h3.4" />
                <path d="M3.8 12.3a5.9 5.9 0 0 0 10.1 2.1l1.6-1.6" />
                <path d="M15.8 15.8v-3.4h-3.4" />
            </>
        ),
        spark: (
            <>
                <path d="M10 2.9 11.5 7l4.1 1.5-4.1 1.5L10 14.1 8.5 10 4.4 8.5 8.5 7 10 2.9Z" />
                <path d="m15.5 13.2.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9Z" />
            </>
        ),
        sync: (
            <>
                <path d="M16.3 8.3a6.4 6.4 0 0 0-10.8-2.6L3.7 7.5" />
                <path d="M3.5 3.9v3.8h3.8" />
                <path d="M3.7 11.7a6.4 6.4 0 0 0 10.8 2.6l1.8-1.8" />
                <path d="M16.5 16.1v-3.8h-3.8" />
            </>
        ),
        vault: (
            <>
                <path d="M5.5 4.5h9a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
                <path d="M10 8.1a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Z" />
                <path d="M10 8.1v5.8M7.1 11h5.8M8 9l4 4M12 9l-4 4" />
            </>
        ),
    } satisfies Record<string, ReactNode>;

    return (
        <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 20 20">
            {paths[name]}
        </svg>
    );
}

function getDocumentTitle(document: DocumentListItem | DocumentRecord): string {
    return (
        document.title ||
        document.source_name ||
        getFileName(document.source_path) ||
        `Document ${document.id}`
    );
}

function getDocumentPathLabel(document: DocumentListItem | DocumentRecord): string {
    return document.source_path || document.normalized_path || document.source_name || `#${document.id}`;
}

function getFileName(path?: string | null): string | null {
    if (!path) {
        return null;
    }

    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function buildScanSummary(result: VaultScanResponse | null): string {
    if (!result) {
        return 'No query yet';
    }

    return `Last scan: ${result.scannedCount} scanned, ${result.importedCount} indexed, ${result.deletedCount} deleted, ${result.failedCount} failed.`;
}

export default App;
