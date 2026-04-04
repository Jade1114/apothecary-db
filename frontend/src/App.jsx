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
                <span className="bubble-meta">{item.dimensionName} · {item.score}</span>
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

export default function App() {
  const [content, setContent] = useState('')
  const [result, setResult] = useState(null)
  const [historyProfiles, setHistoryProfiles] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadHistoryProfiles() {
    try {
      const response = await fetch('/profiles')
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || '读取历史画像失败')
      }
      setHistoryProfiles(data.profiles || [])
    } catch {
      setHistoryProfiles([])
    }
  }

  useEffect(() => {
    loadHistoryProfiles()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    const trimmed = content.trim()
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
      loadHistoryProfiles()
    } catch (requestError) {
      setError(requestError.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>AI 个人知识画像助手</h1>
        <p className="desc">当前页面展示规则版气泡画像、生成版画像，以及已保存的历史画像。</p>

        <form onSubmit={handleSubmit} className="form">
          <label htmlFor="content" className="label">输入资料内容</label>
          <textarea
            id="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="输入一段你的资料、观点、自述或聊天片段..."
          />

          <button type="submit" disabled={loading}>
            {loading ? '提交中...' : '提交到 /profile'}
          </button>
        </form>

        {error ? <p className="error-text">{error}</p> : null}

        {result ? (
          <>
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

            <section className="result raw-panel">
              <h2>检索依据句子</h2>
              {result.matchedSentences?.length ? (
                <div className="evidence-list">
                  {result.matchedSentences.map((sentence, index) => (
                    <blockquote key={`matched-${index}`}>{sentence}</blockquote>
                  ))}
                </div>
              ) : (
                <p className="empty-text">还没有命中的依据句子</p>
              )}
            </section>

            <details className="result raw-panel">
              <summary>查看原始返回 JSON</summary>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </details>
          </>
        ) : (
          <section className="result">
            <h2>返回结果</h2>
            <p className="empty-text">还没有请求</p>
          </section>
        )}

        <section className="result raw-panel">
          <h2>历史画像</h2>
          {historyProfiles.length ? (
            <div className="history-list">
              {historyProfiles.map((profile) => (
                <article key={profile.id} className="history-card">
                  <div className="history-header">
                    <strong>画像 #{profile.id}</strong>
                    <span className="history-time">{profile.created_at}</span>
                  </div>
                  <p className="dimension-desc">文档 ID：{profile.document_id}</p>
                  <p>{profile.summary}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-text">还没有历史画像</p>
          )}
        </section>
      </section>
    </main>
  )
}
