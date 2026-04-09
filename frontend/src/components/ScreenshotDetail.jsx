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

export default function ScreenshotDetail({ screenshot, onClose, onRefresh, onDelete }) {
  const [rescanning, setRescanning] = useState(false)
  const [rescanError, setRescanError] = useState('')
  const tags = normalizeTags(screenshot.tags)

  const handleRescan = async () => {
    setRescanning(true)
    setRescanError('')
    try {
      await rescanScreenshot(screenshot.id)
      onRefresh()
      // Note: We don't close, user can wait for update
    } catch (e) {
      console.error(e)
      setRescanError('Nao foi possivel atualizar a analise desta captura.')
    } finally {
      setRescanning(false)
    }
  }

  const encodedPath = encodeURIComponent(screenshot.file_path)
  const fullImageSrc = `http://localhost:8000/screenshots-file/${encodedPath}`

  const formattedDate = new Date(screenshot.timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="glass border-b border-[#f1f2f6] px-8 py-4 flex items-center justify-between sticky top-0 z-20">
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

      <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
        {/* Image Side */}
        <div className="flex-grow bg-[#f8f9fa] p-8 lg:p-12 flex items-center justify-center overflow-auto custom-scrollbar">
          <div className="relative group max-w-full">
            <img
              src={fullImageSrc}
              alt={screenshot.filename}
              className="max-w-full shadow-2xl rounded-sm border border-[#dfe6e9]"
            />
            <div className="absolute top-4 left-4 glass px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-[#2d3436]">
              {screenshot.application || 'Capture'}
            </div>
          </div>
        </div>

        {/* Info Side */}
        <div className="w-full lg:w-[450px] border-l border-[#f1f2f6] flex flex-col h-full bg-white">
          <div className="p-8 space-y-10 overflow-y-auto custom-scrollbar">
            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em] font-sans">Moment Captured</p>
                <h2 className="text-xl font-serif italic text-[#2d3436] font-bold leading-tight">{screenshot.summary || 'Unidentified Activity'}</h2>
                <p className="text-xs text-[#636e72] font-medium">{formattedDate}</p>
              </div>
              
              <div className="flex flex-wrap gap-2 pt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-[#fcfaf7] border border-[#f1f2f6] text-[#636e72] text-[10px] font-bold rounded-full uppercase tracking-wider"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em] font-sans">AI Narrative</p>
              <div className="bg-[#fcfaf7] p-6 rounded-2xl border border-[#f1f2f6] shadow-sm">
                <p className="text-sm text-[#2d3436] leading-relaxed font-serif italic whitespace-pre-wrap">
                  {screenshot.description || "The soul of this capture is still being contemplated..."}
                </p>
              </div>
              {rescanError && (
                <p className="text-xs text-rose-600 font-medium">{rescanError}</p>
              )}
            </section>

            <section className="space-y-4">
              <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em] font-sans">Artifact Details</p>
              <div className="space-y-3">
                <DetailRow label="Application" value={screenshot.application || 'App not detected'} />
                <DetailRow label="Filename" value={screenshot.filename} />
                <DetailRow label="Status" value={screenshot.status} color={getStatusColor(screenshot.status)} />
                <DetailRow label="Storage Path" value={screenshot.file_path} isPath />
              </div>
            </section>

            {screenshot.status === 'error' && (
              <section className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-2">Error Encountered</p>
                <p className="text-xs text-rose-700 font-medium italic">{screenshot.error_message}</p>
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
    <div className="flex flex-col space-y-1">
      <span className="text-[10px] font-bold text-[#dfe6e9] uppercase tracking-wider">{label}</span>
      <span className={`text-[11px] font-medium break-all ${color} ${isPath ? 'font-mono' : 'font-sans'}`}>
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
