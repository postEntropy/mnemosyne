import { useEffect, useRef, useState } from 'react'
import { getScreenshot, rescanScreenshot, updateScreenshotTags } from '../api'
import { buildAiDisplay, sameAiDisplay, normalizeTagInput, normalizeTags } from '../utils/shared'

export default function ScreenshotDetail({ screenshot, onClose, onRefresh, onDelete }) {
  const [liveScreenshot, setLiveScreenshot] = useState(screenshot)
  const [displayAi, setDisplayAi] = useState(() => buildAiDisplay(screenshot))
  const [rescanning, setRescanning] = useState(false)
  const [rescanError, setRescanError] = useState('')
  const [narrativeExpanded, setNarrativeExpanded] = useState(false)
  const [aiReveal, setAiReveal] = useState(false)
  const [aiContentFading, setAiContentFading] = useState(false)
  const [tagEditLoading, setTagEditLoading] = useState(false)
  const [tagComposerOpen, setTagComposerOpen] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const tagInputRef = useRef(null)
  const prevStatusRef = useRef(liveScreenshot?.status)
  const tags = displayAi.tags
  const safeSummary = displayAi.summary
  const safeDescription = displayAi.description
  const canExpandNarrative = safeDescription.length > 320
  const isAiGenerating = rescanning || liveScreenshot.status === 'pending' || liveScreenshot.status === 'processing'

  useEffect(() => {
    setLiveScreenshot(screenshot)
    setDisplayAi(buildAiDisplay(screenshot))
    setNarrativeExpanded(false)
    setAiReveal(false)
    setAiContentFading(false)
    setTagComposerOpen(false)
    setTagDraft('')
    prevStatusRef.current = screenshot?.status
  }, [screenshot])

  useEffect(() => {
    if (!tagComposerOpen) return
    tagInputRef.current?.focus()
  }, [tagComposerOpen])

  useEffect(() => {
    if (isAiGenerating) return

    const nextDisplay = buildAiDisplay(liveScreenshot)
    if (sameAiDisplay(nextDisplay, displayAi)) return

    setAiContentFading(true)
    const updateTimer = setTimeout(() => {
      setDisplayAi(nextDisplay)
      setAiContentFading(false)
    }, 250)

    return () => clearTimeout(updateTimer)
  }, [liveScreenshot, isAiGenerating, displayAi])

  useEffect(() => {
    const prevStatus = prevStatusRef.current
    const nextStatus = liveScreenshot?.status
    const completedNow =
      (prevStatus === 'pending' || prevStatus === 'processing') && nextStatus === 'processed'

    if (completedNow) {
      setAiReveal(true)
      const timer = setTimeout(() => setAiReveal(false), 1300)
      prevStatusRef.current = nextStatus
      return () => clearTimeout(timer)
    }

    prevStatusRef.current = nextStatus
  }, [liveScreenshot?.status])

  useEffect(() => {
    const status = liveScreenshot?.status
    if (status !== 'pending' && status !== 'processing') return

    const interval = setInterval(async () => {
      try {
        const res = await getScreenshot(liveScreenshot.id)
        setLiveScreenshot(res.data)
      } catch (e) {
        console.error(e)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [liveScreenshot?.id, liveScreenshot?.status])

  const handleRescan = async () => {
    setRescanning(true)
    setRescanError('')
    try {
      await rescanScreenshot(liveScreenshot.id)
      setLiveScreenshot((prev) => ({
        ...prev,
        status: 'pending',
        error_message: null,
      }))
      await onRefresh()
    } catch (e) {
      console.error(e)
      setRescanError('Nao foi possivel atualizar a analise desta captura.')
    } finally {
      setRescanning(false)
    }
  }

  const syncTags = async (nextTags) => {
    setTagEditLoading(true)
    setRescanError('')
    try {
      const res = await updateScreenshotTags(liveScreenshot.id, nextTags)
      const updated = res.data.screenshot || null
      if (updated) {
        setLiveScreenshot(updated)
        setDisplayAi((prev) => ({
          ...prev,
          tags: normalizeTags(updated.tags),
        }))
      } else {
        setLiveScreenshot((prev) => ({
          ...prev,
          tags: nextTags,
        }))
        setDisplayAi((prev) => ({
          ...prev,
          tags: nextTags,
        }))
      }
      await onRefresh()
    } catch (e) {
      console.error(e)
      setRescanError('Nao foi possivel atualizar as tags desta captura.')
    } finally {
      setTagEditLoading(false)
    }
  }

  const handleRemoveTag = (tagToRemove) => {
    const nextTags = tags.filter((tag) => tag !== tagToRemove)
    syncTags(nextTags)
  }

  const closeTagComposer = () => {
    setTagComposerOpen(false)
    setTagDraft('')
  }

  const handleOpenTagComposer = () => {
    setRescanError('')
    setTagComposerOpen(true)
  }

  const handleSubmitTag = async () => {
    const nextTag = normalizeTagInput(tagDraft)
    if (!nextTag) return
    if (tags.includes(nextTag)) {
      setRescanError('Essa tag ja existe nesta captura.')
      return
    }

    await syncTags([...tags, nextTag])
    closeTagComposer()
  }

  const handleTagComposerKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSubmitTag()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      closeTagComposer()
    }
  }

  const encodedPath = encodeURIComponent(liveScreenshot.file_path)
  const fullImageSrc = `http://localhost:8000/screenshots-file/${encodedPath}`

  const formattedDate = new Date(liveScreenshot.timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="h-screen overflow-hidden bg-[#fdfcfb] flex flex-col">
      <header className="shrink-0 glass border-b border-[#f1f2f6] px-8 py-4 flex items-center justify-between z-20">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-[#636e72] hover:text-[#2d3436] transition font-medium text-sm"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Return to Archive
        </button>
        <div className="flex gap-4">
          {onDelete && (
            <button
              onClick={() => onDelete(screenshot.id)}
              className="btn-secondary border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleRescan}
            disabled={rescanning}
            className="btn-secondary"
          >
            {rescanning ? 'Analyzing...' : 'Refresh Analysis'}
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Image Side */}
        <div className="flex-grow min-h-0 bg-[#f8f9fa] p-5 lg:p-8 flex items-center justify-center overflow-hidden">
          <div className="relative group max-w-full">
            <img
              src={fullImageSrc}
              alt={liveScreenshot.filename}
              className="max-w-full max-h-[calc(100vh-9rem)] lg:max-h-[calc(100vh-8rem)] object-contain shadow-2xl rounded-sm border border-[#dfe6e9]"
            />
            <div className="absolute top-4 left-4 bg-[#1a1c1d]/82 backdrop-blur-md px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-white border border-white/20 shadow-lg">
              {liveScreenshot.application || 'Capture'}
            </div>
          </div>
        </div>

        {/* Info Side */}
        <div className="w-full lg:w-[420px] border-l border-[#f1f2f6] flex flex-col h-full min-h-0 glass-strong overflow-hidden">
          <div className="p-6 lg:p-7 space-y-6 overflow-hidden">
            <section className={`space-y-4 ${aiReveal ? 'ai-refresh-reveal' : ''}`}>
              <div className={`space-y-1 transition-all duration-500 ${aiContentFading ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}>
                <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em] font-sans">Moment Captured</p>
                <h2 className={`text-[1.15rem] font-reading-serif text-[#2d3436] font-semibold leading-snug tracking-tight line-clamp-2 transition-all duration-500 ${isAiGenerating ? 'blur-[1px] opacity-65' : ''}`}>{safeSummary}</h2>
                <p className="text-xs text-[#636e72] font-medium">{formattedDate}</p>
              </div>
              
              <div className={`flex flex-wrap gap-2 pt-2 transition-all duration-500 ${isAiGenerating ? 'blur-[1px] opacity-65' : ''} ${aiContentFading ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}>
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="group relative inline-flex items-center gap-1 px-3 py-1 bg-[#fcfaf7] border border-[#f1f2f6] text-[#636e72] text-[10px] font-bold rounded-full uppercase tracking-wider"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      disabled={tagEditLoading}
                      className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[#7f868d] opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-rose-100 hover:text-rose-600"
                      aria-label={`Remove tag ${tag}`}
                      title={`Remove ${tag}`}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
                {tagComposerOpen ? (
                  <div className="inline-flex items-center gap-1 rounded-full border border-[#e7dccf] bg-[#fffaf4] px-2 py-1 shadow-sm">
                    <span className="pl-1 text-[10px] font-bold uppercase tracking-wider text-[#b45309]">#</span>
                    <input
                      ref={tagInputRef}
                      value={tagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={handleTagComposerKeyDown}
                      placeholder="nova tag"
                      maxLength={40}
                      disabled={tagEditLoading}
                      className="w-28 bg-transparent text-[10px] font-bold uppercase tracking-wider text-[#2d3436] placeholder:text-[#d4a76f] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSubmitTag}
                      disabled={tagEditLoading || !normalizeTagInput(tagDraft)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#b45309] transition-colors hover:bg-[#f7e8d4] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Save tag"
                      title="Save tag"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={closeTagComposer}
                      disabled={tagEditLoading}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#7f868d] transition-colors hover:bg-[#f1f2f6] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Cancel tag editing"
                      title="Cancel"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenTagComposer}
                    disabled={tagEditLoading}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#d8d0c6] bg-[#fcfaf7] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#7f868d] transition-all duration-200 hover:border-[#b45309] hover:text-[#b45309]"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14m-7-7h14" />
                    </svg>
                    Add Tag
                  </button>
                )}
              </div>
            </section>

            <section className={`space-y-3 ${aiReveal ? 'ai-refresh-reveal' : ''}`}>
              <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em] font-sans">AI Narrative</p>
              <div className={`bg-[#fcfaf7] p-4 rounded-2xl border border-[#f1f2f6] shadow-sm ${narrativeExpanded ? 'max-h-72 overflow-hidden' : ''}`}>
                <div className={`${narrativeExpanded ? 'max-h-56 overflow-y-auto custom-scrollbar pr-2' : ''}`}>
                  <p className={`text-[14px] text-[#374151] leading-[1.65] font-reading-serif tracking-[0.005em] whitespace-pre-wrap transition-all duration-500 ${narrativeExpanded ? '' : 'line-clamp-4'} ${isAiGenerating ? 'blur-[1px] opacity-65' : ''} ${aiContentFading ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}>
                    {safeDescription}
                  </p>
                </div>
                {canExpandNarrative && (
                  <button
                    onClick={() => setNarrativeExpanded((prev) => !prev)}
                    className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f868d] hover:text-[#1a1c1d] transition-colors"
                  >
                    {narrativeExpanded ? 'Collapse Narrative' : 'Read Full Narrative'}
                  </button>
                )}
              </div>
              {rescanError && (
                <p className="text-xs text-rose-600 font-medium">{rescanError}</p>
              )}
            </section>

            <section className={`space-y-4 rounded-2xl transition-all duration-700 ${aiReveal ? 'ai-refresh-reveal' : ''}`}>
              <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em] font-sans">Artifact Details</p>
              <div className="space-y-2.5 transition-all duration-500">
                <DetailRow label="Application" value={liveScreenshot.application || 'App not detected'} />
                <DetailRow label="Filename" value={liveScreenshot.filename} />
                <DetailRow label="Status" value={liveScreenshot.status.charAt(0).toUpperCase() + liveScreenshot.status.slice(1)} color={getStatusColor(liveScreenshot.status)} />
                <DetailRow label="Storage Path" value={liveScreenshot.file_path} isPath />
              </div>
            </section>

            {liveScreenshot.status === 'error' && (
              <section className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-2">Error Encountered</p>
                <p className="text-xs text-rose-700 font-medium italic">{liveScreenshot.error_message}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, color = 'text-[#2d3436]', isPath = false }) {
  return (
    <div className="flex flex-col space-y-1 min-w-0">
      <span className="text-[10px] font-bold text-[#dfe6e9] uppercase tracking-wider">{label}</span>
      <span className={`text-[11px] font-medium ${color} ${isPath ? 'font-mono truncate' : 'font-sans truncate'}`} title={value}>
        {value}
      </span>
    </div>
  )
}

function getStatusColor(status) {
  switch (status) {
    case 'processed': return 'text-green-600'
    case 'pending': return 'text-amber-500'
    case 'processing': return 'text-[#5e6472]'
    case 'error': return 'text-rose-500'
    default: return 'text-gray-400'
  }
}
