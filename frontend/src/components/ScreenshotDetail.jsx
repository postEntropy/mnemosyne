import { useEffect, useState } from 'react'
import { getScreenshot, rescanScreenshot } from '../api'

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
  const [liveScreenshot, setLiveScreenshot] = useState(screenshot)
  const [rescanning, setRescanning] = useState(false)
  const [rescanError, setRescanError] = useState('')
  const tags = normalizeTags(liveScreenshot.tags)

  useEffect(() => {
    setLiveScreenshot(screenshot)
  }, [screenshot])

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
    <div className="min-h-screen bg-[#fdfcfb] flex flex-col">
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
        <div className="flex-grow bg-[#f8f9fa] p-6 lg:p-10 flex items-center justify-center overflow-hidden">
          <div className="relative group max-w-full">
            <img
              src={fullImageSrc}
              alt={liveScreenshot.filename}
              className="max-w-full max-h-[calc(100vh-10rem)] lg:max-h-[calc(100vh-8rem)] object-contain shadow-2xl rounded-sm border border-[#dfe6e9]"
            />
            <div className="absolute top-4 left-4 bg-[#1a1c1d]/82 backdrop-blur-md px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-white border border-white/20 shadow-lg">
              {liveScreenshot.application || 'Capture'}
            </div>
          </div>
        </div>

        {/* Info Side */}
        <div className="w-full lg:w-[450px] border-l border-[#f1f2f6] flex flex-col h-full glass-strong">
          <div className="p-8 space-y-10 overflow-y-auto custom-scrollbar">
            <section className="space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em] font-sans">Moment Captured</p>
                <h2 className="text-[1.25rem] font-serif text-[#2d3436] font-semibold leading-snug tracking-tight">{liveScreenshot.summary || 'Unidentified Activity'}</h2>
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
                  {liveScreenshot.description || "The soul of this capture is still being contemplated..."}
                </p>
              </div>
              {rescanError && (
                <p className="text-xs text-rose-600 font-medium">{rescanError}</p>
              )}
            </section>

            <section className="space-y-4">
              <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em] font-sans">Artifact Details</p>
              <div className="space-y-3">
                <DetailRow label="Application" value={liveScreenshot.application || 'App not detected'} />
                <DetailRow label="Filename" value={liveScreenshot.filename} />
                <DetailRow label="Status" value={liveScreenshot.status} color={getStatusColor(liveScreenshot.status)} />
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
