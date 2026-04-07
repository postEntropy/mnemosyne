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
  processing: 'bg-blue-100 text-blue-700',
  error: 'bg-rose-100 text-rose-700',
}

export default function ScreenshotList({ screenshots, onSelect, onRefresh }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-10">
      {screenshots.map((ss) => (
        <ScreenshotCard
          key={ss.id}
          screenshot={ss}
          onSelect={onSelect}
          onRefresh={onRefresh}
        />
      ))}
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
      window.alert('Nao foi possivel reenfileirar essa captura agora.')
    }
  }

  const thumbSrc = screenshot.thumbnail_path
    ? `/thumbnails/${screenshot.thumbnail_path.split('/').pop()}`
    : null

  const formattedDate = new Date(screenshot.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const tags = normalizeTags(screenshot.tags)

  const isAnalyzing = screenshot.status === 'processing' || screenshot.status === 'pending'

  return (
    <div
      onClick={() => onSelect(screenshot)}
      className="group cursor-pointer flex flex-col space-y-4"
    >
      <div className="aspect-[16/10] bg-[#f8f9fa] relative overflow-hidden rounded-3xl border border-[#f1f2f6] shadow-sm group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-500">
        {thumbSrc && !thumbFailed ? (
          <img 
            src={thumbSrc} 
            alt={screenshot.filename} 
            onError={() => setThumbFailed(true)}
            className={`w-full h-full object-cover transition duration-1000 group-hover:scale-105 ${isAnalyzing ? 'blur-[1px] grayscale opacity-70' : ''}`} 
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-[#9ea5ab] text-xs font-serif italic gap-2">
            <div className="w-8 h-8 rounded-full border border-[#dfe6e9] flex items-center justify-center bg-white/70">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span>Thumbnail pending</span>
          </div>
        )}
        
        {/* Progress overlay for analyzing items */}
        {isAnalyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-2">
                <div className="w-6 h-6 border-2 border-[#2d3436] border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-serif italic text-[#2d3436] animate-pulse">Analyzing capture...</p>
            </div>
        )}

        {/* Status Badge */}
        <div className="absolute top-4 right-4">
            <span
              className={`px-3 py-1.5 text-[9px] font-bold rounded-full uppercase tracking-wider shadow-sm backdrop-blur-md ${
                statusStyles[screenshot.status] || 'bg-white/80 text-gray-700'
              }`}
            >
              {screenshot.status}
            </span>
        </div>

        {!isAnalyzing && (
            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center">
                <div className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-500">
                    <svg className="w-6 h-6 text-[#2d3436]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>
        )}
      </div>

      <div className="px-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-widest">
            {screenshot.application || (isAnalyzing ? 'Contemplating...' : 'Capture')}
          </span>
          <span className="text-[10px] text-[#b2bec3] font-medium">
            {formattedDate}
          </span>
        </div>
        
        <div className="relative">
          <h3 className={`text-sm font-serif font-bold text-[#2d3436] leading-tight group-hover:text-[#4a4e69] transition ${isAnalyzing ? 'opacity-65' : ''}`}>
            {screenshot.summary || screenshot.filename}
            </h3>
            {isAnalyzing && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-[shimmer_2s_infinite]" />
            )}
        </div>
        
        {tags.length > 0 && !isAnalyzing && (
            <div className="flex gap-1.5 pt-1 overflow-hidden opacity-60">
                {tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[9px] font-medium text-[#636e72]">#{tag}</span>
                ))}
            </div>
        )}
      </div>
    </div>
  )
}
