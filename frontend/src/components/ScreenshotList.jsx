import { useState } from 'react'
import { rescanScreenshot } from '../api'
import { normalizeTags, sanitizeSummary, sanitizeDescription, formatCaptureDateTime, getThumbnailUrl } from '../utils/shared'

export default function ScreenshotList({ screenshots, onSelect, onRefresh, onDelete, viewMode = 'grid' }) {
  if (viewMode === 'list') {
    return (
      <div className="px-5 md:px-8 xl:px-12 2xl:px-16">
        <div className="space-y-4">
          {screenshots.map((ss) => (
            <ScreenshotListRow
              key={ss.id}
              screenshot={ss}
              onSelect={onSelect}
              onDelete={onDelete}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 md:px-8 xl:px-12 2xl:px-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 md:gap-7">
      {screenshots.map((ss) => (
        <ScreenshotCard
          key={ss.id}
          screenshot={ss}
          onSelect={onSelect}
          onDelete={onDelete}
          onRefresh={onRefresh}
        />
      ))}
      </div>
    </div>
  )
}

function ScreenshotCard({ screenshot, onSelect, onDelete }) {
  const [thumbFailed, setThumbFailed] = useState(false)
  const [rescanning, setRescanning] = useState(false)

  const handleRescanClick = async (e) => {
    e.stopPropagation()
    if (rescanning) return
    setRescanning(true)
    try {
      await rescanScreenshot(screenshot.id)
    } catch (error) {
      console.error(error)
    } finally {
      setRescanning(false)
    }
  }

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    if (!onDelete) return
    onDelete(screenshot.id)
  }

  const thumbSrc = getThumbnailUrl(screenshot.thumbnail_path)

  const formattedDateTime = formatCaptureDateTime(screenshot.timestamp)

  const tags = normalizeTags(screenshot.tags)
  const isAnalyzing = screenshot.status === 'processing'
  const summary = sanitizeSummary(screenshot)

  return (
    <div
      onClick={() => onSelect(screenshot)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(screenshot) } }}
      role="button"
      tabIndex={0}
      className="group cursor-pointer flex flex-col space-y-3.5 w-full"
    >
      <div className={`card-archive aspect-[16/9] relative group-hover:-translate-y-1 transition-all duration-300 overflow-hidden ${isAnalyzing ? 'blur-[1.5px] opacity-85' : ''}`}>
        {onDelete && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleRescanClick}
              className="h-8 w-8 rounded-lg border border-amber-200/40 bg-amber-700/28 text-amber-50 shadow-[0_8px_22px_-10px_rgba(245,158,11,0.35)] backdrop-blur-md hover:bg-amber-600/70 hover:text-white hover:scale-105 hover:shadow-[0_14px_30px_-12px_rgba(245,158,11,0.6)] transition-all duration-200 flex items-center justify-center"
              aria-label="Reanalyze screenshot"
              title="Reanalyze screenshot"
              disabled={rescanning}
            >
              <svg className={`h-4 w-4 ${rescanning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8 8 0 004.582 9m0 0H10m10 11v-5h-.581m0 0A8.001 8.001 0 014.644 15m15.355 0H14" />
              </svg>
            </button>
            <button
              onClick={handleDeleteClick}
              className="h-8 w-8 rounded-lg border border-rose-200/40 bg-rose-700/32 text-rose-100 shadow-[0_8px_22px_-10px_rgba(244,63,94,0.45)] backdrop-blur-md hover:bg-rose-600/75 hover:text-white hover:scale-105 hover:shadow-[0_14px_30px_-12px_rgba(244,63,94,0.7)] transition-all duration-200 flex items-center justify-center"
              aria-label="Delete screenshot"
              title="Delete screenshot"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}

        {thumbSrc && !thumbFailed ? (
          <img 
            src={thumbSrc} 
            alt={screenshot.filename} 
            onError={() => setThumbFailed(true)}
            className={`w-full h-full object-cover transition duration-400 group-hover:scale-110 ${isAnalyzing ? 'blur-sm grayscale opacity-40' : 'opacity-90 group-hover:opacity-100 group-hover:brightness-75'}`} 
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-[#94999e] text-[10px] font-bold uppercase tracking-[0.2em] gap-3 bg-[#fdfcfb]">
            <div className="w-10 h-10 rounded-full border border-[#f0ede9] flex items-center justify-center bg-white">
              <svg className="w-4 h-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span>Unrecorded</span>
          </div>
        )}
        
        {/* Status Badge - Physical Tag Look */}
        {isAnalyzing && (
          <div className="absolute top-4 right-4">
            <span
              className={`px-3 py-1 text-[9px] font-bold rounded-md uppercase tracking-[0.2em] backdrop-blur-md shadow-sm border border-white/20 ${
                screenshot.status === 'processed' ? 'bg-white/90 text-[#1a1c1d]' : 'bg-[#1a1c1d]/80 text-white'
              }`}
            >
              {screenshot.status.charAt(0).toUpperCase() + screenshot.status.slice(1)}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      </div>

      <div className="px-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-[#1a1c1d] uppercase tracking-[0.2em]">
            {screenshot.application || 'App Not Detected'}
          </span>
          <span className="text-[9px] font-bold text-[#1a1c1d] uppercase tracking-[0.18em] opacity-45">
            {formattedDateTime}
          </span>
        </div>
        
        <h3
          title={summary}
          className="relative text-[15px] font-reading-serif font-semibold text-[#1a1c1d] leading-tight group-hover:text-[#5e6472] transition-colors duration-500"
        >
          <span className="block overflow-hidden whitespace-nowrap pr-8">{summary}</span>
          <span className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-[#fdfcfb]" />
        </h3>
        
        {tags.length > 0 && (
            <div className="flex gap-1.5 pt-0.5 overflow-hidden opacity-40 group-hover:opacity-70 transition-opacity">
                {tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[9px] font-bold text-[#1a1c1d]">#{tag}</span>
                ))}
            </div>
        )}
      </div>
    </div>
  )
}

function ScreenshotListRow({ screenshot, onSelect, onDelete }) {
  const [thumbFailed, setThumbFailed] = useState(false)

  const thumbSrc = getThumbnailUrl(screenshot.thumbnail_path)

  const tags = normalizeTags(screenshot.tags)
  const summary = sanitizeSummary(screenshot)
  const descriptionPreview = sanitizeDescription(screenshot)
  const formattedDateTime = formatCaptureDateTime(screenshot.timestamp, true)
  const isAnalyzing = screenshot.status === 'processing'
  const handleDeleteClick = (e) => {
    e.stopPropagation()
    if (!onDelete) return
    onDelete(screenshot.id)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(screenshot)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(screenshot)
        }
      }}
      className="w-full text-left group relative rounded-3xl border border-[#ece7dd] bg-white/75 backdrop-blur-md p-3 md:p-4 transition-all duration-500 hover:border-[#d9d1c6] hover:shadow-[0_16px_40px_-20px_rgba(15,23,42,0.2)] cursor-pointer"
    >
      {onDelete && (
        <span className="absolute top-3 right-3 z-20">
          <button
            type="button"
            onClick={handleDeleteClick}
            className="h-8 w-8 rounded-lg border border-rose-200/40 bg-rose-700/32 text-rose-100 shadow-[0_8px_22px_-10px_rgba(244,63,94,0.45)] backdrop-blur-md opacity-0 group-hover:opacity-100 hover:bg-rose-600/75 hover:text-white hover:scale-105 hover:shadow-[0_14px_30px_-12px_rgba(244,63,94,0.7)] transition-all duration-200 flex items-center justify-center"
            aria-label="Delete screenshot"
            title="Delete screenshot"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
            </svg>
          </button>
        </span>
      )}

      <div className={`flex items-start gap-4 md:gap-5 transition-all duration-300 ${isAnalyzing ? 'blur-[1.5px] opacity-85' : ''}`}>
        <div className="w-44 md:w-56 shrink-0">
          <div className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-[#ece7dd]">
            {thumbSrc && !thumbFailed ? (
              <img
                src={thumbSrc}
                alt={screenshot.filename}
                onError={() => setThumbFailed(true)}
                className="w-full h-full object-cover transition duration-700 group-hover:scale-105 group-hover:brightness-75"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#94999e] bg-[#fdfcfb]">
                Unrecorded
              </div>
            )}
            {isAnalyzing && (
              <div className="absolute top-3 right-3">
                <span className="px-2.5 py-1 text-[9px] font-bold rounded-md uppercase tracking-[0.2em] bg-[#1a1c1d]/80 text-white border border-white/20 backdrop-blur-md shadow-sm">
                  {screenshot.status.charAt(0).toUpperCase() + screenshot.status.slice(1)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] font-bold">
            <span className="text-[#1a1c1d]">{screenshot.application || 'App Not Detected'}</span>
            <span className="text-[#94999e]">{formattedDateTime}</span>
          </div>

          <h3 className="relative text-[18px] font-reading-serif font-semibold text-[#1a1c1d]" title={summary}>
            <span className="block overflow-hidden whitespace-nowrap pr-10">{summary}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent to-[#fdfcfb]" />
          </h3>

          <p className="text-[13px] text-[#5e6472] leading-relaxed line-clamp-2">{descriptionPreview}</p>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.slice(0, 6).map((tag) => (
                <span key={tag} className="px-2 py-1 rounded-md text-[10px] font-bold bg-white border border-[#ece7dd] text-[#7f868d]">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
