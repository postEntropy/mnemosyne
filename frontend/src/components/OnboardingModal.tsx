import { useState, useEffect } from 'react'
import { scanFolder, getScanProgress, ignoreOnboardingPending } from '../api.ts'
import type { OnboardingInfo, ScanProgress } from '../types/index.ts'

interface OnboardingModalProps {
  data: OnboardingInfo | null
  onClose: () => void
  onScanComplete: () => void
  onStartBackgroundScan?: () => void
  onDismissed?: () => void
}

export default function OnboardingModal({
  data,
  onClose,
  onScanComplete,
  onStartBackgroundScan,
  onDismissed,
}: OnboardingModalProps) {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    return () => {
      setScanning(false)
    }
  }, [])

  if (!data || data.unregistered === 0) return null

  const handleStartScan = async () => {
    setScanning(true)
    setErrorMessage('')
    if (onStartBackgroundScan) onStartBackgroundScan()

    setProgress({ queued: 0, total: data.unregistered, done: 0, current_file: null })
    try {
      const batchSize = 50
      let batchIndex = 0
      let hasMore = true

      while (hasMore) {
        const res = await scanFolder(batchSize, batchIndex)
        const d = res.data
        setProgress((prev) => ({
          ...prev!,
          queued: prev!.queued + d.queued,
          total: d.total_new || prev!.total,
        }))
        hasMore = d.has_more
        batchIndex++
        if (hasMore) {
          await new Promise((r) => setTimeout(r, 500))
        }
      }

      let idleTicks = 0
      let errorTicks = 0
      const startedAt = Date.now()
      const interval = setInterval(async () => {
        try {
          const p = await getScanProgress()
          errorTicks = 0

          const total = Math.max(0, p.data.total || 0)
          const done = Math.max(0, Math.min(total, (p.data.processed || 0) + (p.data.errors || 0)))

          setProgress((prev) => ({
            ...prev!,
            done,
            total,
            current_file: p.data.current_file,
          }))

          if ((p.data.pending || 0) === 0 && !p.data.current_file) {
            idleTicks += 1
          } else {
            idleTicks = 0
          }

          if (idleTicks >= 2) {
            clearInterval(interval)
            setScanning(false)
            onScanComplete()
          }

          if (Date.now() - startedAt > 10 * 60 * 1000) {
            clearInterval(interval)
            setScanning(false)
            setErrorMessage('Scan demorou demais para concluir.')
          }
        } catch (e) {
          console.error(e)
          errorTicks += 1
          if (errorTicks >= 3) {
            clearInterval(interval)
            setScanning(false)
            setErrorMessage('Falha ao acompanhar progresso do scan.')
          }
        }
      }, 2000)
    } catch (e) {
      console.error(e)
      setErrorMessage('Falha ao iniciar o scan de onboarding.')
      setScanning(false)
    }
  }

  const handleClose = async () => {
    localStorage.setItem('onboardingDismissed', 'true')
    try {
      await ignoreOnboardingPending()
      if (onDismissed) onDismissed()
    } catch (e) {
      console.error(e)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2d3436]/40 backdrop-blur-md">
      <div className="bg-white border border-[#f1f2f6] rounded-[2rem] p-12 max-w-xl w-full mx-4 shadow-2xl relative overflow-hidden text-center">
        {/* Decorative element */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#fcfaf7] rounded-full blur-3xl opacity-50" />

        <div className="relative z-10">
          <div className="mx-auto w-24 h-24 bg-[#fcfaf7] border border-[#f1f2f6] rounded-full flex items-center justify-center mb-10 shadow-inner">
            <svg className="w-10 h-10 text-[#2d3436]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>

          <h2 className="text-3xl font-serif italic font-bold text-[#2d3436] mb-6">
            {scanning ? 'Invoking Mnemosyne...' : 'Unseen Memories Found'}
          </h2>

          <p className="text-[#636e72] text-lg leading-relaxed mb-10 max-w-md mx-auto font-serif italic">
            {scanning
              ? `Processing ${progress?.done || 0} of ${progress?.total || data.unregistered} captures.`
              : `There are ${data.unregistered} moments in your archive that await interpretation. Shall we begin the analysis?`
            }
          </p>

          {scanning && progress && (
            <div className="mb-12 px-6 space-y-6">
              <div className="space-y-2">
                <div className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-full h-3 overflow-hidden shadow-inner">
                    <div
                    className="bg-[#2d3436] h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                        width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                    }}
                    />
                </div>
                <div className="flex justify-between items-center mt-4 px-1">
                    <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-widest">Ritual Progress</p>
                    <p className="text-[10px] font-bold text-[#2d3436] uppercase tracking-widest">
                        {Math.round((progress.done / progress.total) * 100)}% Complete
                    </p>
                </div>
              </div>

              {/* Blurred Text Effect */}
              <div className="relative h-12 flex items-center justify-center">
                {progress.current_file ? (
                    <div className="relative group">
                        <p className="text-sm font-serif italic text-[#2d3436] blur-[2.5px] select-none opacity-50 transition-all duration-1000">
                            Contemplating {progress.current_file}
                        </p>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-[shimmer_2s_infinite]" />
                    </div>
                ) : (
                    <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-widest animate-pulse">
                        Seeking next memory...
                    </p>
                )}
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          {!scanning ? (
            <div className="flex gap-6 justify-center">
              <button
                onClick={handleClose}
                className="btn-secondary px-10 py-3"
              >
                Not yet
              </button>
              <button
                onClick={handleStartScan}
                className="btn-primary px-12 py-3"
              >
                Begin Analysis
              </button>
            </div>
          ) : (
            <button
              onClick={handleClose}
              className="btn-secondary px-12 py-3"
            >
              Continue in Background
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
