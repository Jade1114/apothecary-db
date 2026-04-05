import { useEffect, useMemo, useState } from 'react'

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

function InputPanel({
  inputMode,
  setInputMode,
  content,
  setContent,
  selectedFileName,
  conversationText,
  setConversationText,
  loading,
  error,
  onFileChange,
  onSubmit,
  onRegenerate,
  canRegenerate
}) {
  return (
    <section className="panel input-panel">
      <div className="panel-head">
        <h2>输入与操作区</h2>
        <p>聚焦当前画像生成，支持文本 / 文档与对话输入。</p>
      </div>

      <form onSubmit={onSubmit} className="form">
        <div className="mode-switch">
          <button
            type="button"
            className={`mode-button ${inputMode === 'text' ? 'mode-button-active' : ''}`}
            onClick={() => setInputMode('text')}
          >
            文本 / 文档
          </button>
          <button
            type="button"
            className={`mode-button ${inputMode === 'conversation' ? 'mode-button-active' : ''}`}
            onClick={() => setInputMode('conversation')}
          >
            对话
          </button>
        </div>

        {inputMode === 'text' ? (
          <>
            <label htmlFor="source-file" className="label">
              导入文档（txt / md）
            </label>
            <input
              id="source-file"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={onFileChange}
            />
            {selectedFileName ? (
              <p className="file-hint">当前已导入：{selectedFileName}</p>
            ) : (
              <p className="file-hint">还没有导入文档，也可以直接在下面粘贴内容</p>
            )}

            <label htmlFor="content" className="label">
              输入资料内容
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="输入一段你的资料、观点、自述或聊天片段..."
            />
          </>
        ) : (
          <>
            <label htmlFor="conversation" className="label">
              输入对话内容
            </label>
            <textarea
              id="conversation"
              value={conversationText}
              onChange={(event) => setConversationText(event.target.value)}
              placeholder={'示例：\n用户：我最近在学 Java 并发。\n助手：你更想从线程池还是锁开始？'}
            />
            <p className="file-hint">当前先用纯文本方式录入对话，后续再扩展更正式的聊天导入格式。</p>
          </>
        )}

        <div className="action-row">
          <button type="submit" disabled={loading}>
            {loading ? '提交中...' : '生成当前画像'}
          </button>
        </div>
      </form>

      <RegenerateActionBar onRegenerate={onRegenerate} loading={loading} canRegenerate={canRegenerate} />

      {error ? <p className="error-text">{error}</p> : null}
    </section>
  )
}

function CurrentProfilePanel({ result }) {
  const summaryText =
    result?.generatedProfile?.summary ||
    result?.ruleBasedProfile?.summary ||
    '当前暂无 summary，可先查看下方规则版与生成版画像。'

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
              <strong>{result.length}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">段落数</span>
              <strong>{result.chunkCount}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">命中段落</span>
              <strong>{result.matchedChunkCount}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">命中句子</span>
              <strong>{result.matchedSentenceCount}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">生成器</span>
              <strong>{result.generationMeta?.provider || 'unknown'}</strong>
            </div>
          </section>

          <BubbleProfileSection
            title="规则版画像"
            profile={result.ruleBasedProfile}
            emptyText="规则版画像暂时为空"
          />

          <ProfileSection
            title="生成版画像"
            profile={result.generatedProfile}
            emptyText="生成版画像暂时为空"
          />

          <section className="result-panel">
            <h3>检索结果 · 按维度</h3>
            {Object.keys(result.retrieval?.byDimension || {}).length ? (
              <div className="dimension-list retrieval-grid">
                {Object.entries(result.retrieval.byDimension).map(([dimension, evidence]) => (
                  <article key={dimension} className="dimension-card">
                    <h4>{dimension}</h4>
                    {evidence?.length ? (
                      <div className="evidence-list">
                        {evidence.map((sentence, index) => (
                          <blockquote key={`${dimension}-${index}`}>{sentence}</blockquote>
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

          <section className="result-panel">
            <h3>检索结果 · 合并依据</h3>
            {result.retrieval?.combinedEvidence?.length ? (
              <div className="evidence-list">
                {result.retrieval.combinedEvidence.map((sentence, index) => (
                  <blockquote key={`combined-${index}`}>{sentence}</blockquote>
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
          <h3>当前画像</h3>
          <p className="empty-text">还没有请求，先在上方输入并生成画像。</p>
        </section>
      )}
    </section>
  )
}

export default function App() {
  const [inputMode, setInputMode] = useState('text')
  const [content, setContent] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [conversationText, setConversationText] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastSubmittedContent, setLastSubmittedContent] = useState('')

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      setContent(text)
      setSelectedFileName(file.name)
      setError('')
    } catch {
      setError('读取文件失败，请重新选择 txt 或 md 文档')
    }
  }

  async function requestProfile(sourceText) {
    const trimmed = sourceText.trim()
    if (!trimmed) {
      setError('请先输入内容')
      setResult(null)
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: trimmed })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || '请求失败')
      }

      setResult(data)
      setLastSubmittedContent(trimmed)
    } catch (requestError) {
      setError(requestError.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const sourceContent = inputMode === 'conversation' ? conversationText : content
    await requestProfile(sourceContent)
  }

  async function handleRegenerate() {
    const sourceContent = lastSubmittedContent || (inputMode === 'conversation' ? conversationText : content)
    await requestProfile(sourceContent)
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>当前画像工作台</h1>
        <p className="desc">围绕当前画像的输入、生成与查看，历史功能将在后续开放。</p>
      </header>

      <InputPanel
        inputMode={inputMode}
        setInputMode={setInputMode}
        content={content}
        setContent={setContent}
        selectedFileName={selectedFileName}
        conversationText={conversationText}
        setConversationText={setConversationText}
        loading={loading}
        error={error}
        onFileChange={handleFileChange}
        onSubmit={handleSubmit}
        onRegenerate={handleRegenerate}
        canRegenerate={Boolean(lastSubmittedContent || content.trim() || conversationText.trim())}
      />

      <CurrentProfilePanel result={result} />

      <p className="history-placeholder">历史画像功能后续开放。</p>
    </main>
  )
}
