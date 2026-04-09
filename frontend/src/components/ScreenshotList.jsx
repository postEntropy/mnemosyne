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

export default function ScreenshotList({ screenshots, onSelect, onRefresh }) {
  return (
    <div className="px-2 md:px-4 xl:px-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-12">
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

  return (
    <div
      onClick={() => onSelect(screenshot)}
      className="group cursor-pointer flex flex-col space-y-6"
    >
      <div className="card-archive aspect-[16/10] relative group-hover:-translate-y-2 transition-all duration-700">
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

        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700 flex items-center justify-center">
            <div className="bg-white p-5 rounded-full shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-700">
                <svg className="w-5 h-5 text-[#1a1c1d]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>
        </div>
      </div>

      <div className="px-1 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#1a1c1d] uppercase tracking-[0.25em]">
            {screenshot.application || 'App Not Detected'}
          </span>
          <span className="text-[9px] font-bold text-[#1a1c1d] uppercase tracking-[0.2em] opacity-45">
            {formattedDate}
          </span>
        </div>
        
        <h3 className="text-lg font-serif font-bold text-[#1a1c1d] leading-tight group-hover:text-[#5e6472] transition-colors duration-500 line-clamp-2">
          {screenshot.summary || screenshot.filename}
        </h3>
        
        {tags.length > 0 && (
            <div className="flex gap-2 pt-1 overflow-hidden opacity-40 group-hover:opacity-70 transition-opacity">
                {tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[10px] font-bold text-[#1a1c1d]">#{tag}</span>
                ))}
            </div>
        )}
      </div>
    </div>
  )
}
