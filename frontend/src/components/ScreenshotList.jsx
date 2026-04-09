import { useState } from 'react'
import { rescanScreenshot } from '../api'

function normalizeTags(rawTags) {
  if (Array.isArray(rawTags)) return rawTags
  if (typeof rawTags !== 'string') return []

  try {
    const parsed = JSON.parse(rawTags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const statusStyles = {
  processed: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-[#f0ede9] text-[#4a4e52]',
  error: 'bg-rose-100 text-rose-700',
}

export default function ScreenshotList({ screenshots, onSelect, onRefresh, viewMode = 'grid' }) {
  if (viewMode === 'list') {
    return (
      <div className="px-5 md:px-8 xl:px-12 2xl:px-16">
        <div className="space-y-4">
          {screenshots.map((ss) => (
            <ScreenshotListRow
              key={ss.id}
              screenshot={ss}
              onSelect={onSelect}
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
          onRefresh={onRefresh}
        />
      ))}
      </div>
    </div>
  )
}

function ScreenshotCard({ screenshot, onSelect, onRefresh }) {
  const [thumbFailed, setThumbFailed] = useState(false)

  const handleRescan = async (e) => {
    e.stopPropagation()
    try {
      await rescanScreenshot(screenshot.id)
      onRefresh()
    } catch (err) {
      console.error(err)
    }
  }

  const thumbSrc = screenshot.thumbnail_path
    ? `/thumbnails/${screenshot.thumbnail_path.split('/').pop()}`
    : null

  const formattedDate = new Date(screenshot.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  const tags = normalizeTags(screenshot.tags)
  const isAnalyzing = screenshot.status === 'processing' || screenshot.status === 'pending'
  const summary = screenshot.summary || screenshot.filename

  return (
    <div
      onClick={() => onSelect(screenshot)}
      className="group cursor-pointer flex flex-col space-y-3.5 w-full"
    >
      <div className="card-archive aspect-[16/9] relative group-hover:-translate-y-1 transition-all duration-700 overflow-hidden">
        {thumbSrc && !thumbFailed ? (
          <img 
            src={thumbSrc} 
            alt={screenshot.filename} 
            onError={() => setThumbFailed(true)}
            className={`w-full h-full object-cover transition duration-1000 group-hover:scale-110 ${isAnalyzing ? 'blur-sm grayscale opacity-40' : 'opacity-90 group-hover:opacity-100'}`} 
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
        <div className="absolute top-4 right-4">
            <span
              className={`px-3 py-1 text-[8px] font-bold rounded-md uppercase tracking-[0.2em] backdrop-blur-md shadow-sm border border-white/20 ${
                screenshot.status === 'processed' ? 'bg-white/90 text-[#1a1c1d]' : 'bg-[#1a1c1d]/80 text-white'
              }`}
            >
              {screenshot.status}
            </span>
        </div>

        {isAnalyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-5 h-5 border border-[#1a1c1d] border-t-transparent rounded-full animate-spin" />
                <p className="text-[9px] font-bold text-[#1a1c1d] uppercase tracking-[0.3em] animate-pulse">Restoring...</p>
            </div>
        )}

        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      </div>

      <div className="px-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-bold text-[#1a1c1d] uppercase tracking-[0.2em]">
            {screenshot.application || 'App Not Detected'}
          </span>
          <span className="text-[8px] font-bold text-[#1a1c1d] uppercase tracking-[0.18em] opacity-45">
            {formattedDate}
          </span>
        </div>
        
        <h3
          title={summary}
          className="relative text-[15px] font-serif font-bold text-[#1a1c1d] leading-tight group-hover:text-[#5e6472] transition-colors duration-500"
        >
          <span className="block overflow-hidden whitespace-nowrap pr-8">{summary}</span>
          <span className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-[#fdfcfb]" />
        </h3>
        
        {tags.length > 0 && (
            <div className="flex gap-1.5 pt-0.5 overflow-hidden opacity-40 group-hover:opacity-70 transition-opacity">
                {tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[8px] font-bold text-[#1a1c1d]">#{tag}</span>
                ))}
            </div>
        )}
      </div>
    </div>
  )
}

function ScreenshotListRow({ screenshot, onSelect }) {
  const [thumbFailed, setThumbFailed] = useState(false)

  const thumbSrc = screenshot.thumbnail_path
    ? `/thumbnails/${screenshot.thumbnail_path.split('/').pop()}`
    : null

  const tags = normalizeTags(screenshot.tags)
  const summary = screenshot.summary || screenshot.filename
  const formattedDate = new Date(screenshot.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <button
      onClick={() => onSelect(screenshot)}
      className="w-full text-left group rounded-3xl border border-[#ece7dd] bg-white/75 backdrop-blur-md p-3 md:p-4 transition-all duration-500 hover:border-[#d9d1c6] hover:shadow-[0_16px_40px_-20px_rgba(15,23,42,0.2)]"
    >
      <div className="flex items-start gap-4 md:gap-5">
        <div className="w-44 md:w-56 shrink-0">
          <div className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-[#ece7dd]">
            {thumbSrc && !thumbFailed ? (
              <img
                src={thumbSrc}
                alt={screenshot.filename}
                onError={() => setThumbFailed(true)}
                className="w-full h-full object-cover transition duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#94999e] bg-[#fdfcfb]">
                Unrecorded
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
          <div className="flex items-center gap-3 text-[9px] uppercase tracking-[0.2em] font-bold">
            <span className="text-[#1a1c1d]">{screenshot.application || 'App Not Detected'}</span>
            <span className="text-[#94999e]">{formattedDate}</span>
            <span className={`px-2 py-0.5 rounded-md border border-[#ece7dd] ${screenshot.status === 'processed' ? 'text-[#1a1c1d] bg-white' : 'text-white bg-[#1a1c1d]/80'}`}>
              {screenshot.status}
            </span>
          </div>

          <h3 className="relative text-[18px] font-serif font-bold text-[#1a1c1d]" title={summary}>
            <span className="block overflow-hidden whitespace-nowrap pr-10">{summary}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent to-[#fdfcfb]" />
          </h3>

          <p className="text-[13px] text-[#5e6472] leading-relaxed line-clamp-2">{summary}</p>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.slice(0, 6).map((tag) => (
                <span key={tag} className="px-2 py-1 rounded-md text-[9px] font-bold bg-white border border-[#ece7dd] text-[#7f868d]">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
