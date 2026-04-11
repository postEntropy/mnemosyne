import { useState, useCallback, useEffect, useRef } from 'react'
import { scanFolder, getScanProgress, togglePause, toggleWatcherPause, getStatus } from '../api.ts'
import type { ScanProgress } from '../types/index.ts'

interface UseScanReturn {
  scanning: boolean
  scanProgress: ScanProgress | null
  paused: boolean
  watcherPaused: boolean
  handleScanFolder: () => Promise<void>
  handleTogglePause: () => Promise<void>
  handleToggleWatcherPause: () => Promise<void>
  setScanning: (v: boolean) => void
  setScanProgress: React.Dispatch<React.SetStateAction<ScanProgress | null>>
  setPaused: React.Dispatch<React.SetStateAction<boolean>>
  setWatcherPaused: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Manages scan operations: batch scanning, progress tracking, pause/resume.
 */
export function useScan(onScanComplete?: () => void): UseScanReturn {
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [paused, setPaused] = useState(false)
  const [watcherPaused, setWatcherPaused] = useState(false)
  const scanningRef = useRef(scanning)

  useEffect(() => {
    scanningRef.current = scanning
  }, [scanning])

  // Load paused status from backend on mount
  useEffect(() => {
    getStatus().then((res) => {
      setPaused(res.data.is_paused)
      setWatcherPaused(Boolean(res.data.watcher_paused))
    })
  }, [])

  // Monitor scan progress
  useEffect(() => {
    if (!scanning) return

    let idleTicks = 0
    let errorTicks = 0
    const startedAt = Date.now()

    const interval = setInterval(async () => {
      try {
        const p = await getScanProgress()
        errorTicks = 0

        const total = Math.max(0, p.data.total || 0)
        const done = Math.max(0, Math.min(total, (p.data.processed || 0) + (p.data.errors || 0)))

        setScanProgress((prev) => ({
          queued: prev?.queued ?? 0,
          done,
          total,
          current_file: p.data.current_file ?? null,
        }))

        if ((p.data.pending || 0) === 0 && !p.data.current_file) {
          idleTicks += 1
        } else {
          idleTicks = 0
        }

        // Require two consecutive idle checks to avoid race with worker cleanup.
        if (idleTicks >= 2) {
          setScanning(false)
          setScanProgress(null)
          onScanComplete?.()
        }

        // Safety net: stop polling after 30 minutes for very large libraries.
        if (Date.now() - startedAt > 30 * 60 * 1000) {
          setScanning(false)
          setScanProgress(null)
        }
      } catch {
        errorTicks += 1
        if (errorTicks >= 3) {
          setScanning(false)
          setScanProgress(null)
        }
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [scanning, onScanComplete])

  const handleScanFolder = useCallback(async () => {
    if (scanningRef.current) return
    setScanning(true)
    setScanProgress({ queued: 0, total: 0, done: 0, current_file: null })
    try {
      const batchSize = 50
      let batchIndex = 0
      let hasMore = true

      while (hasMore) {
        const res = await scanFolder(batchSize, batchIndex)
        const data = res.data
        setScanProgress((prev) => ({
          queued: (prev?.queued ?? 0) + data.queued,
          done: prev?.done ?? 0,
          total: data.total_new,
          current_file: prev?.current_file ?? null,
        }))
        hasMore = data.has_more
        batchIndex++
        if (hasMore) {
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    } catch {
      setScanning(false)
      setScanProgress(null)
    }
  }, [])

  const handleTogglePause = useCallback(async () => {
    try {
      const res = await togglePause()
      setPaused(res.data.is_paused)
    } catch {
      // Error handled by caller
    }
  }, [])

  const handleToggleWatcherPause = useCallback(async () => {
    try {
      const res = await toggleWatcherPause()
      setWatcherPaused(Boolean(res.data.watcher_paused))
    } catch {
      // Error handled by caller
    }
  }, [])

  return {
    scanning,
    scanProgress,
    paused,
    watcherPaused,
    handleScanFolder,
    handleTogglePause,
    handleToggleWatcherPause,
    setScanning,
    setScanProgress,
    setPaused,
    setWatcherPaused,
  }
}
