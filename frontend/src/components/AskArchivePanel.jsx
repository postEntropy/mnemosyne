import { useState, useEffect } from 'react'

const FALLBACK_SUGGESTIONS = [
  {
    title: 'Recent activity recap',
    prompt: 'What have I been working on recently?',
    kind: 'timeline',
  },
  {
    title: 'Most used apps',
    prompt: 'Which apps did I use the most in the last few days?',
    kind: 'application',
  },
  {
    title: 'Recurring themes',
    prompt: 'Which themes appear most often in my archive?',
    kind: 'tag',
  },
]

function suggestionIcon(kind) {
  if (kind === 'application') {
    return (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )
  }

  if (kind === 'tag') {
    return (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M7 7h.01M3 11l8.586 8.586a2 2 0 002.828 0l6-6a2 2 0 000-2.828L11.828 2H5a2 2 0 00-2 2v7z" />
      </svg>
    )
  }

  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

export default function AskArchivePanel({ 
  onAsk,
  loading,
  answer,
  matches,
  onOpenMatch,
  _provider,
  suggestions = [],
  contextItems = 0,
  retrievedItems = 0,
  dbTokenEstimate = 0,
  dbTokenUpdatedAt = '',
  dbTokenizerName = '',
  historyEntries = [],
  activeHistoryId = null,
  initialQuestion = '',
  onSelectHistory,
}) {
  const [question, setQuestion] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [showHistoryMenu, setShowHistoryMenu] = useState(false)
  useEffect(() => {
    setQuestion(initialQuestion || '')
  }, [initialQuestion])

  useEffect(() => {
    if (answer || matches?.length > 0) {
      setShowResults(true)
    }
  }, [answer, matches])

  const submit = (e) => {
    e.preventDefault()
    if (!question.trim() || loading) return
    onAsk(question.trim())
  }

  const handleSuggestion = (prompt) => {
    setQuestion(prompt)
    onAsk(prompt)
  }

  const visibleSuggestions = (Array.isArray(suggestions) && suggestions.length > 0
    ? suggestions
    : FALLBACK_SUGGESTIONS).slice(0, 3)

  const visibleHistory = (Array.isArray(historyEntries) ? historyEntries : []).slice(0, 12)

  return (
    <div className="w-full px-5 md:px-8 xl:px-12 2xl:px-16 pt-12 md:pt-16 pb-8 md:pb-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="rounded-3xl border border-[#ece7dd] bg-white/75 backdrop-blur-md p-5 md:p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.22)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold tracking-[0.35em] uppercase text-[#b45309]">Ask Mnemosyne</p>
              <h2 className="mt-1 text-2xl md:text-3xl text-[#1a1c1d] font-reading-serif">Archive</h2>
            </div>
            <div className="flex items-center gap-2.5">
              {(retrievedItems > 0 || contextItems > 0) && (
                <div className="h-8 rounded-lg border border-[#ece7dd] bg-[#fcfbf9] px-2.5 flex items-center gap-1">
                  <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-[#94999e]">Context</p>
                  <p className="text-[10px] leading-none text-[#1a1c1d] font-semibold">{contextItems.toLocaleString()} / {retrievedItems.toLocaleString()}</p>
                </div>
              )}

              {dbTokenEstimate > 0 && (
                <div
                  className="h-8 rounded-lg border border-[#ece7dd] bg-[#fcfbf9] px-2.5 flex items-center gap-1"
                  title={dbTokenUpdatedAt ? `Updated: ${new Date(dbTokenUpdatedAt).toLocaleString()} | ${dbTokenizerName || 'token_estimator'}` : (dbTokenizerName || 'token_estimator')}
                >
                  <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-[#94999e]">DB Tokens</p>
                  <p className="text-[10px] leading-none text-[#1a1c1d] font-semibold">~{dbTokenEstimate.toLocaleString()}</p>
                </div>
              )}

              {visibleHistory.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowHistoryMenu((prev) => !prev)}
                    className="h-8 w-8 rounded-lg border border-[#e8e2d9] bg-[#fcfbf9] text-[#7f868d] hover:text-[#1a1c1d] hover:border-[#d9d0c3] transition-all duration-200 flex items-center justify-center"
                    title="Past Answers"
                    aria-label="Past Answers"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#1a1c1d] text-white text-[9px] font-bold flex items-center justify-center">
                    {visibleHistory.length}
                  </span>

                  {showHistoryMenu && (
                    <div className="absolute right-0 mt-2 w-[320px] max-w-[85vw] rounded-2xl border border-[#ece7dd] bg-white shadow-[0_30px_60px_-30px_rgba(15,23,42,0.25)] p-3 z-30">
                      <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-[#94999e] mb-2">Past Answers</p>
                      <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                        {visibleHistory.map((item) => {
                          const active = item.id === activeHistoryId
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                onSelectHistory?.(item.id)
                                setShowHistoryMenu(false)
                              }}
                              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all duration-200 ${
                                active
                                  ? 'border-[#b45309]/45 bg-[#fdf8f0]'
                                  : 'border-[#ece7dd] bg-white hover:border-[#d9d0c3]'
                              }`}
                            >
                              <p className="text-[11px] font-semibold text-[#1a1c1d] truncate">{item.question || 'Untitled question'}</p>
                              <p className="text-[10px] text-[#7f868d] mt-1">
                                {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={submit} className="relative group">
            <div className="relative bg-white/90 rounded-2xl border border-[#e8e2d9] p-2 pl-5 flex items-center gap-3 transition-all duration-300 group-focus-within:border-[#1a1c1d]/35">
              <svg className="w-4 h-4 text-[#5e6472]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask based on screenshots..."
                className="flex-grow bg-transparent border-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 text-[#1a1c1d] placeholder-[#94999e] py-2.5 text-sm font-reading-serif"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="h-9 px-5 rounded-xl flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.2em] bg-[#1a1c1d] text-white hover:bg-[#0f1011] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Ask'
                )}
              </button>
            </div>
          </form>

          <div className="mt-5">
            <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-[#94999e] mb-3 px-1">
              {showResults ? 'Next Questions' : 'Suggestions'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {visibleSuggestions.map((s, i) => (
                <button
                  key={`${s.title}-${i}`}
                  onClick={() => handleSuggestion(s.prompt)}
                  className="group relative transition-all duration-300 text-left"
                >
                  <div className="relative rounded-2xl border border-[#ece7dd] bg-white/70 p-4 min-h-28 flex flex-col justify-between group-hover:bg-white group-hover:border-[#d9d0c3] transition-all duration-300">
                    <div className="text-[#b45309] opacity-70 group-hover:opacity-100 transition-all duration-300 mb-2.5">
                      {suggestionIcon(s.kind)}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[15px] font-reading-serif font-semibold text-[#1a1c1d] leading-snug block group-hover:text-[#5e6472] transition-colors">
                        {s.title}
                      </span>
                      <p className="text-[10px] text-[#7f868d] line-clamp-2">{s.prompt}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {showResults && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#ece7dd] bg-white/85 p-4 md:p-4.5 shadow-[0_14px_40px_-30px_rgba(15,23,42,0.22)]">
              <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-[#94999e] mb-3">Answer</p>
              <p className="text-[15px] leading-7 text-[#1a1c1d] whitespace-pre-wrap font-reading-serif">
                {answer}
              </p>
            </div>

            {matches?.length > 0 && (
              <div className="rounded-2xl border border-[#ece7dd] bg-white/70 p-4 md:p-4.5">
                <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-[#94999e] mb-3">Evidence</p>
                <div className="overflow-x-auto thin-scrollbar pb-2">
                  <div className="flex gap-3 min-w-max">
                  {matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onOpenMatch(m)}
                      className="group w-52 shrink-0 text-left rounded-xl border border-[#ece7dd] bg-white p-2 transition-all duration-300 hover:border-[#d9d0c3]"
                    >
                      <div className="relative h-24 rounded-lg overflow-hidden border border-[#f0ede9] mb-2 bg-[#f8f7f5]">
                        {m.thumbnail_path ? (
                          <img
                            src={`/thumbnails/${m.thumbnail_path.split('/').pop()}`}
                            alt={`Thumbnail for ${m.summary || m.filename}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#94a3b8] text-xs">No thumbnail</div>
                        )}
                      </div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#b45309]">#{m.id}</p>
                      <p className="mt-1 text-[12px] leading-snug text-[#1a1c1d] font-reading-serif line-clamp-2">{m.summary || m.filename}</p>
                    </button>
                  ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
