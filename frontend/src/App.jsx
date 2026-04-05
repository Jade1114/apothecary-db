import { useEffect, useMemo, useState } from 'react'

const DIMENSION_ORDER = ['技术兴趣', '关注话题', '表达风格']

const DIMENSION_HINTS = {
  技术兴趣: '体现用户偏好的技术方向和投入重点',
  关注话题: '体现用户持续关注和反复讨论的问题域',
  表达风格: '体现用户说话方式、沟通习惯和推进方式'
}

function buildDimensionCards(byDimension = {}) {
  const cards = DIMENSION_ORDER.map((dimension) => [dimension, byDimension[dimension] || []])
  const known = new Set(DIMENSION_ORDER)

  Object.entries(byDimension).forEach(([dimension, evidence]) => {
    if (!known.has(dimension)) {
      cards.push([dimension, evidence || []])
    }
  })

  return cards
}

function BubbleProfileSection({ title, profile, emptyText }) {
  const [selectedItem, setSelectedItem] = useState(null)

  const items = useMemo(
    () =>
      (profile?.dimensions || []).flatMap((dimension) =>
        (dimension.items || []).map((item) => ({ ...item, dimensionName: dimension.name }))
      ),
    [profile]
  )

  useEffect(() => {
    setSelectedItem(items[0] || null)
  }, [items])

  if (!profile) {
    return null
  }

  return (
    <section className="profile-section">
      <div className="section-header">
        <h2>{title}</h2>
        <p>{profile.summary || emptyText}</p>
      </div>

      {items.length ? (
        <>
          <div className="bubble-board">
            {items.map((item) => (
              <button
                key={`${item.dimensionName}-${item.keyword}`}
                type="button"
                className={`bubble bubble-score-${Math.min(item.score || 1, 5)} ${selectedItem?.keyword === item.keyword ? 'bubble-active' : ''}`}
                onClick={() => setSelectedItem(item)}
              >
                <span className="bubble-keyword">{item.keyword}</span>
                <span className="bubble-meta">
                  {item.dimensionName} · {item.score}
                </span>
              </button>
            ))}
          </div>

          <article className="dimension-card bubble-detail-card">
            {selectedItem ? (
              <>
                <div className="bubble-detail-header">
                  <h3>{selectedItem.keyword}</h3>
                  <span className="item-score">Score {selectedItem.score}</span>
                </div>
                <p className="dimension-desc">所属维度：{selectedItem.dimensionName}</p>
                <p className="item-reason">{selectedItem.reason}</p>
                <div className="evidence-list">
                  {(selectedItem.evidence || []).map((sentence, index) => (
                    <blockquote key={`${selectedItem.keyword}-${index}`}>{sentence}</blockquote>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty-text">点击上方气泡查看关键词详情</p>
            )}
          </article>
        </>
      ) : (
        <p className="empty-text">当前画像还没有可展示的条目</p>
      )}
    </section>
  )
}

function ProfileSection({ title, profile, emptyText }) {
  if (!profile) {
    return null
  }

  return (
    <section className="profile-section">
      <div className="section-header">
        <h2>{title}</h2>
        <p>{profile.summary || emptyText}</p>
      </div>

      <div className="dimension-list">
        {(profile.dimensions || []).map((dimension) => (
          <article key={dimension.name} className="dimension-card">
            <h3>{dimension.name}</h3>
            <p className="dimension-desc">{dimension.description}</p>

            {dimension.items?.length ? (
              <div className="chip-list">
                {dimension.items.map((item) => (
                  <details key={`${dimension.name}-${item.keyword}`} className="item-card">
                    <summary>
                      <span className="item-keyword">{item.keyword}</span>
                      <span className="item-score">Score {item.score}</span>
                    </summary>
                    <p className="item-reason">{item.reason}</p>
                    <div className="evidence-list">
                      {(item.evidence || []).map((sentence, index) => (
                        <blockquote key={`${item.keyword}-${index}`}>{sentence}</blockquote>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <p className="empty-text">当前维度还没有可展示的条目</p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

function RegenerateActionBar({ onRegenerate, loading, canRegenerate }) {
  return (
    <div className="action-bar">
      <button
        type="button"
        className="secondary-button"
        onClick={onRegenerate}
        disabled={loading || !canRegenerate}
      >
        {loading ? '重新生成中...' : '重新生成画像'}
      </button>
      <p className="action-hint">手动触发重新生成，后续可接入自动增量更新。</p>
    </div>
  )
}

function normalizeProfilePayload(payload) {
  if (!payload) {
    return null
  }

  // /profile/current -> { profile: { profile_json, ... } }
  if (payload.profile) {
    const profileRow = payload.profile
    return {
      generatedProfile: profileRow.profile_json || null,
      ruleBasedProfile: null,
      retrieval: {
        byDimension: {},
        combinedEvidence: []
      },
      generationMeta: {
        provider: 'saved-profile',
        ragEnabled: null,
        ragSetupError: null
      },
      storage: {
        profileId: profileRow.id,
        documentId: profileRow.document_id
      },
      length: null,
      chunkCount: null,
      matchedChunkCount: null,
      matchedSentenceCount: null
    }
  }

  // /profile/generate -> already close to UI shape
  return {
    generatedProfile: payload.generatedProfile || null,
    ruleBasedProfile: payload.ruleBasedProfile || null,
    retrieval: payload.retrieval || { byDimension: {}, combinedEvidence: [] },
    generationMeta: payload.generationMeta || {},
    storage: payload.storage || null,
    length: payload.length ?? null,
    chunkCount: payload.chunkCount ?? null,
    matchedChunkCount: payload.matchedChunkCount ?? null,
    matchedSentenceCount: payload.matchedSentenceCount ?? null
  }
}

function InputPanel({
  content,
  setContent,
  ingesting,
  generating,
  error,
  onIngest,
  onRegenerate,
  canRegenerate,
  ingestHint
}) {
  return (
    <section className="panel input-panel">
      <div className="panel-head">
        <h2>输入与操作区</h2>
        <p>当前阶段先支持直接输入资料内容，附件上传能力将在后续开放。</p>
      </div>

      <form onSubmit={onIngest} className="form">
        <label htmlFor="content" className="label">
          输入资料内容
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="输入一段你的资料、观点、自述或聊天片段..."
        />

        <div className="action-row">
          <button type="submit" disabled={ingesting || generating}>
            {ingesting ? '入库中...' : '资料入库'}
          </button>
        </div>
      </form>

      {ingestHint ? <p className="action-hint">{ingestHint}</p> : null}

      <RegenerateActionBar onRegenerate={onRegenerate} loading={generating} canRegenerate={canRegenerate} />

      {error ? <p className="error-text">{error}</p> : null}
    </section>
  )
}

function CurrentProfilePanel({ result }) {
  const summaryText = result?.generatedProfile?.summary || '当前暂无主画像 summary，请先生成。'
  const dimensionCards = buildDimensionCards(result?.retrieval?.byDimension || {})

  return (
    <section className="panel current-panel">
      <div className="panel-head">
        <h2>当前画像区</h2>
        <p>当前请求的画像摘要、维度内容与检索依据。</p>
      </div>

      {result ? (
        <>
          <section className="summary-card">
            <h3>当前画像摘要</h3>
            <p>{summaryText}</p>
          </section>

          <section className="meta-grid">
            <div className="meta-card">
              <span className="meta-label">原始长度</span>
              <strong>{result.length ?? '-'}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">段落数</span>
              <strong>{result.chunkCount ?? '-'}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">命中段落</span>
              <strong>{result.matchedChunkCount ?? '-'}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">命中句子</span>
              <strong>{result.matchedSentenceCount ?? '-'}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">生成器</span>
              <strong>{result.generationMeta?.provider || 'unknown'}</strong>
            </div>
          </section>

          <ProfileSection title="当前主画像" profile={result.generatedProfile} emptyText="当前主画像暂时为空" />

          <section className="result-panel">
            <h3>检索结果 · 按维度</h3>
            {dimensionCards.length ? (
              <div className="dimension-list retrieval-grid">
                {dimensionCards.map(([dimension, evidence]) => (
                  <article key={dimension} className="dimension-card retrieval-dimension-card">
                    <div className="retrieval-card-head">
                      <h4>
                        {dimension} · {evidence?.length || 0}条
                      </h4>
                      {DIMENSION_HINTS[dimension] ? (
                        <p className="dimension-hint">{DIMENSION_HINTS[dimension]}</p>
                      ) : null}
                    </div>
                    {evidence?.length ? (
                      <div className="evidence-list">
                        {evidence.map((sentence, index) => (
                          <blockquote
                            key={`${dimension}-${index}`}
                            className={index === 0 ? 'evidence-primary' : ''}
                          >
                            {sentence}
                          </blockquote>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-text">当前维度没有检索到内容</p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-text">当前没有按维度的检索结果</p>
            )}
          </section>

          <section className="result-panel retrieval-combined-panel">
            <h3>最终送入生成模型的依据</h3>
            {result.retrieval?.combinedEvidence?.length ? (
              <div className="evidence-list">
                {result.retrieval.combinedEvidence.map((sentence, index) => (
                  <blockquote key={`combined-${index}`} className="combined-evidence-item">
                    {sentence}
                  </blockquote>
                ))}
              </div>
            ) : (
              <p className="empty-text">当前没有合并后的依据句子</p>
            )}
          </section>

          <details className="result-panel debug-panel">
            <summary>查看原始返回 JSON（调试）</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </>
      ) : (
        <section className="result-panel">
          <h3>当前主画像</h3>
          <p className="empty-text">当前没有可展示的主画像，请先完成资料入库并生成。</p>
        </section>
      )}
    </section>
  )
}

export default function App() {
  const [content, setContent] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [ingestHint, setIngestHint] = useState('')

  useEffect(() => {
    async function loadCurrentProfile() {
      try {
        const response = await fetch('/profile/current')
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || '获取当前画像失败')
        }

        setResult(normalizeProfilePayload(data))
      } catch (requestError) {
        setError(requestError.message)
      }
    }

    loadCurrentProfile()
  }, [])

  async function requestIngest(sourceText) {
    const trimmed = sourceText.trim()
    if (!trimmed) {
      setError('请先输入资料内容')
      return
    }

    setIngesting(true)
    setError('')
    setIngestHint('')

    try {
      const response = await fetch('/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: trimmed,
          sourceType: 'text',
          sourceName: null
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || '请求失败')
      }

      setIngestHint(`资料已入库（文档ID: ${data.documentId}，分块: ${data.chunkCount}），可点击“重新生成画像”。`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIngesting(false)
    }
  }

  async function requestGenerateProfile() {
    setGenerating(true)
    setError('')

    try {
      const response = await fetch('/profile/generate', {
        method: 'POST'
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || '生成画像失败')
      }

      setResult(normalizeProfilePayload(data))
      setIngestHint('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleIngest(event) {
    event.preventDefault()
    await requestIngest(content)
  }

  async function handleRegenerate() {
    await requestGenerateProfile()
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>当前画像工作台</h1>
        <p className="desc">围绕当前画像的输入、生成与查看，历史功能将在后续开放。</p>
      </header>

      <InputPanel
        content={content}
        setContent={setContent}
        ingesting={ingesting}
        generating={generating}
        error={error}
        onIngest={handleIngest}
        onRegenerate={handleRegenerate}
        canRegenerate={!generating && !ingesting}
        ingestHint={ingestHint}
      />

      <CurrentProfilePanel result={result} />

      <p className="history-placeholder">历史画像功能后续开放。</p>
    </main>
  )
}
