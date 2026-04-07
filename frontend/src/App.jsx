import { useState, useEffect, useCallback } from 'react'
import ScreenshotList from './components/ScreenshotList'
import SearchBar from './components/SearchBar'
import ScreenshotDetail from './components/ScreenshotDetail'
import Settings from './components/Settings'
import Stats from './components/Stats'
import OnboardingModal from './components/OnboardingModal'
import AskArchivePanel from './components/AskArchivePanel'
import { getScreenshots, getStats, getTags, scanFolder, getScanProgress, getOnboardingInfo, getSettings, getStatus, togglePause, getHealth, searchScreenshots, ignoreOnboardingPending, askArchive } from './api'

export default function App() {
  const [screenshots, setScreenshots] = useState([])
  const [stats, setStats] = useState(null)
  const [tags, setTags] = useState([])
  const [selected, setSelected] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState(null)
  const [statusFilter, setStatusFilter] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [scanProgress, setScanProgress] = useState(null)
  const [onboarding, setOnboarding] = useState(null)
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  const [health, setHealth] = useState(null)
  const [uiError, setUiError] = useState('')
  const [showAsk, setShowAsk] = useState(true)
  const [askLoading, setAskLoading] = useState(false)
  const [askAnswer, setAskAnswer] = useState('')
  const [askMatches, setAskMatches] = useState([])
  const [askProvider, setAskProvider] = useState('')

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    
    try {
      setUiError('')
      const [ssRes, statsRes, tagsRes, statusRes, healthRes] = await Promise.all([
        getScreenshots(page, 24, statusFilter, dateFrom, dateTo),
        getStats(),
        getTags(),
        getStatus(),
        getHealth().catch(() => ({ data: null }))
      ])
      setScreenshots(ssRes.data.screenshots)
      setTotalPages(ssRes.data.pages)
      setStats(statsRes.data)
      setTags(tagsRes.data.tags)
      setPaused(statusRes.data.is_paused)
      setHealth(healthRes?.data)
    } catch (e) {
      console.error(e)
      setUiError('Nao foi possivel carregar os dados do arquivo agora.')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, dateFrom, dateTo])

  // Initial load, config and dependency changes
  useEffect(() => {
    // Load UI Scale from settings
    getSettings().then(res => {
      if (res.data.ui_scale) {
        const scale = parseFloat(res.data.ui_scale)
        document.documentElement.style.fontSize = `${scale * 16}px`
      }
    })

    // Only check onboarding on first load, not on filter changes
    if (!onboardingDismissed) {
      const stored = localStorage.getItem('onboardingDismissed')
      if (stored) {
        setOnboardingDismissed(true)
        // User already dismissed onboarding in the past; make sure legacy pending items are ignored.
        ignoreOnboardingPending()
          .then(() => loadData(true))
          .catch((e) => console.error(e))
      } else {
        getOnboardingInfo().then(res => {
          if (res.data.unregistered > 0) {
            setOnboarding(res.data)
          }
        })
      }
    }
  }, []) // Empty deps - only run once on mount

  useEffect(() => {
    loadData()
  }, [loadData])

  // Background refresh
  useEffect(() => {
    const interval = setInterval(() => loadData(true), 15000)
    return () => clearInterval(interval)
  }, [loadData])

  // Sync scan progress if scanning is active
  useEffect(() => {
    if (!scanning) return;

    let idleTicks = 0
    let errorTicks = 0
    const startedAt = Date.now()

    const interval = setInterval(async () => {
        try {
            const p = await getScanProgress()
        errorTicks = 0

        const total = Math.max(0, p.data.total || 0)
        const done = Math.max(0, Math.min(total, (p.data.processed || 0) + (p.data.errors || 0)))

            setScanProgress(prev => ({
                ...prev,
          done,
          total,
                current_file: p.data.current_file
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
                loadData(true)
            }

        // Safety net: stop polling after 10 minutes.
        if (Date.now() - startedAt > 10 * 60 * 1000) {
          setScanning(false)
          setUiError('Scan demorou demais e foi encerrado. Verifique o backend/Ollama.')
        }
        } catch (e) {
            console.error(e)
        errorTicks += 1
        if (errorTicks >= 3) {
          setScanning(false)
          setScanProgress(null)
          setUiError('Falha ao acompanhar progresso do scan.')
        }
        }
    }, 2000)
    return () => clearInterval(interval)
  }, [scanning, loadData])

  const handleSearch = async (q) => {
    setSearchQuery(q)
    setPage(1)  // Reset to first page for new searches
    if (!q) {
      setActiveTag(null)
      setLoading(true)
      try {
        const res = await getScreenshots(1, 24, statusFilter, dateFrom, dateTo)
        setScreenshots(res.data.screenshots)
        setTotalPages(res.data.pages)
      } catch (e) {
        console.error(e)
        setUiError('Nao foi possivel atualizar a busca.')
      } finally {
        setLoading(false)
      }
      return
    }
    setLoading(true)
    try {
      setUiError('')
      const res = await searchScreenshots(q, 1, 24)
      setScreenshots(res.data.screenshots)
      setTotalPages(res.data.pages || 1)
    } catch (e) {
      console.error(e)
      setUiError('Nao foi possivel buscar capturas agora.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Permanently remove this memory from the archive?")) return
    try {
      const { deleteScreenshot } = await import('./api')
      await deleteScreenshot(id)
      setSelected(null)
      loadData(true)
    } catch (e) {
      console.error(e)
      setUiError('Nao foi possivel deletar a captura.')
    }
  }

  const handleTagClick = (tag) => {
    if (activeTag === tag) {
      setActiveTag(null)
      loadData()
    } else {
      setActiveTag(tag)
      setSearchQuery(tag)
      handleSearch(tag)
    }
  }

  const handleScanFolder = async () => {
    setScanning(true)
    setScanProgress({ queued: 0, total: 0, done: 0, current_file: null })
    try {
      const batchSize = 50
      let batchIndex = 0
      let hasMore = true

      while (hasMore) {
        const res = await scanFolder(batchSize, batchIndex)
        const data = res.data
        setScanProgress(prev => ({
          ...prev,
          queued: prev.queued + data.queued,
          total: data.total_new,
        }))
        hasMore = data.has_more
        batchIndex++
        if (hasMore) {
          await new Promise(r => setTimeout(r, 500))
        }
      }
      // Progress monitoring is handled by useEffect above
    } catch (e) {
      console.error(e)
      setUiError('Scan falhou ao enfileirar capturas.')
      setScanning(false)
      setScanProgress(null)
    }
  }

  const handleTogglePause = async () => {
    try {
        const res = await togglePause()
        setPaused(res.data.is_paused)
    } catch (e) {
        console.error(e)
      setUiError('Nao foi possivel alternar pausa do scan.')
    }
  }

  const handleAskArchive = async (question) => {
    setAskLoading(true)
    try {
      setUiError('')
      const res = await askArchive(question, 8)
      setAskAnswer(res.data.answer || '')
      setAskMatches(res.data.matches || [])
      setAskProvider(res.data.provider || '')
    } catch (e) {
      console.error(e)
      setUiError('Nao foi possivel consultar o arquivo agora.')
    } finally {
      setAskLoading(false)
    }
  }

  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} />
  }

  if (selected) {
    return (
      <ScreenshotDetail
        screenshot={selected}
        onClose={() => setSelected(null)}
        onRefresh={() => loadData(true)}
        onDelete={handleDelete}
      />
    )
  }

  const navigation = [
    { id: 'ask', label: 'Ask Oracle', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: null, label: 'All Memories', count: stats?.total, icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
    { id: 'processed', label: 'Analyzed', count: stats?.processed, icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'processing', label: 'In Progress', count: (stats?.processing || 0) + (stats?.pending || 0), icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'error', label: 'Fragments', count: stats?.errors, icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  ]

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-[22rem] border-r border-[#f1f2f6] flex flex-col bg-[#fcfaf7] z-20">
        <div className="p-10">
          <h1 className="text-3xl font-bold tracking-tight text-[#2d3436]">Mnemosyne</h1>
          <p className="text-xs uppercase tracking-[0.3em] text-[#b2bec3] font-bold mt-1">The Memory Archive</p>
        </div>

        <nav className="flex-grow overflow-y-auto px-6 space-y-10 custom-scrollbar pb-8 pt-4">
          {/* Main Navigation Section */}
          <div className="space-y-4">
            <p className="px-4 text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em]">Collections</p>
            <div className="space-y-1.5">
              {navigation.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { 
                    if (item.id === 'ask') {
                      setShowAsk(true);
                      setStatusFilter(null);
                    } else {
                      setShowAsk(false);
                      setStatusFilter(item.id); 
                    }
                    setPage(1);
                  }}
                  className={`w-full flex items-center justify-between px-5 py-3.5 rounded-2xl transition-all duration-300 ${
                    (item.id === 'ask' && showAsk) || (statusFilter === item.id && !showAsk)
                      ? 'bg-[#2d3436] text-white shadow-xl translate-x-1'
                      : 'text-[#636e72] hover:bg-white hover:text-[#2d3436] hover:translate-x-1'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    <span className="text-sm font-bold tracking-tight truncate">{item.label}</span>
                  </div>
                  {item.count !== undefined && (
                    <span className={`text-sm font-serif font-bold italic opacity-80`}>
                      {item.count.toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tags Cloud */}
          {tags.length > 0 && (
            <div className="space-y-4">
              <p className="px-4 text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em]">Concepts</p>
              <div className="flex flex-wrap gap-2.5 px-2">
                {tags.slice(0, 20).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagClick(tag)}
                    className={`px-4 py-2 text-xs font-bold rounded-full transition border ${
                      activeTag === tag
                        ? 'bg-[#4a4e69] text-white border-[#4a4e69]'
                        : 'bg-white text-[#636e72] border-[#f1f2f6] hover:border-[#b2bec3] shadow-sm'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* System Health */}
          {health && (
            <div className="space-y-3 px-4 pt-4 pb-2 border-t border-[#f1f2f6]">
              <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em]">System Status</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[#636e72] uppercase">Database</span>
                  <span className={`w-2 h-2 rounded-full ${health.checks?.database === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[#636e72] uppercase">Watcher</span>
                  <span className={`w-2 h-2 rounded-full ${health.checks?.watcher_dir === 'exists' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[#636e72] uppercase">Thumbnails</span>
                  <span className={`w-2 h-2 rounded-full ${health.checks?.thumbnails_dir === 'exists' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* Footer Actions */}
        <div className="p-8 border-t border-[#f1f2f6] bg-white space-y-4">
          {scanning && scanProgress && (
            <div className="px-2 mb-6 space-y-3">
               <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-bold text-[#b2bec3] uppercase">
                    <span>{paused ? 'Memories Paused' : 'Restoring Memories'}</span>
                    <span>{Math.round((scanProgress.done/scanProgress.total)*100 || 0)}%</span>
                  </div>
                  <div className="w-full bg-[#fcfaf7] h-1.5 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className={`h-full transition-all duration-1000 ease-out ${paused ? 'bg-[#b2bec3]' : 'bg-[#2d3436]'}`} 
                      style={{width: `${(scanProgress.done/scanProgress.total)*100 || 0}%`}} 
                    />
                  </div>
               </div>
               
               {scanProgress.current_file && !paused && (
                 <div className="flex items-center gap-2 animate-pulse">
                    <div className="w-1 h-1 rounded-full bg-amber-500" />
                    <p className="text-[10px] text-[#636e72] font-medium truncate italic font-serif">
                      Contemplating {scanProgress.current_file}
                    </p>
                 </div>
               )}

               <button 
                 onClick={handleTogglePause}
                 className="w-full flex items-center justify-center gap-2 text-[10px] font-bold text-[#636e72] hover:text-[#2d3436] uppercase tracking-tighter transition"
               >
                  {paused ? (
                    <>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M4.5 3.5A.5.5 0 015 4v13a.5.5 0 01-1 0V4a.5.5 0 01.5-.5zM16.5 3.5a.5.5 0 01.5.5v13a.5.5 0 01-1 0V4a.5.5 0 01.5-.5zM10 3.5a.5.5 0 01.5.5v13a.5.5 0 01-1 0V4a.5.5 0 01.5-.5z" /></svg>
                      Resume Analysis
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                      Pause Analysis
                    </>
                  )}
               </button>
               
               <p className="text-[9px] text-[#b2bec3] font-bold uppercase text-center">
                  {scanProgress.done} of {scanProgress.total} analyzed
               </p>
            </div>
          )}
          <button
            onClick={handleScanFolder}
            disabled={scanning}
            className="w-full btn-secondary text-sm py-3.5"
          >
            {scanning ? (paused ? 'Archive Paused' : 'Archive in Flux...') : 'Scan Library'}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-full btn-primary text-sm py-3.5"
          >
            Oracle Settings
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-grow flex flex-col min-w-0 bg-white relative overflow-hidden">
        <div className={`flex-grow overflow-y-auto custom-scrollbar ${showAsk ? 'p-0' : 'p-10 md:p-12'}`}>
          {showAsk && (
            <AskArchivePanel
              onAsk={handleAskArchive}
              loading={askLoading}
              answer={askAnswer}
              matches={askMatches}
              provider={askProvider}
              onOpenMatch={setSelected}
              dateFrom={dateFrom}
              setDateFrom={(v) => { setDateFrom(v); setPage(1); }}
              dateTo={dateTo}
              setDateTo={(v) => { setDateTo(v); setPage(1); }}
            />
          )}

          {uiError && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {uiError}
            </div>
          )}

          {!showAsk && (
            <div className="mb-8 flex items-center justify-between border-t border-[#f1f2f6] pt-6">
              <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.2em]">Archive Timeline</p>
              <span className="text-xs text-[#98a2aa] font-medium">Historical Perspective</span>
            </div>
          )}

          {(!showAsk || screenshots.length > 0) && (
            loading && screenshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4 pt-20">
                <div className="w-12 h-12 border-2 border-[#2d3436] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-base font-serif italic text-[#636e72]">Consulting the Archive...</p>
              </div>
            ) : screenshots.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-8 pt-20">
                <div className="w-32 h-32 bg-[#fcfaf7] rounded-full flex items-center justify-center">
                   <svg className="w-12 h-12 text-[#dfe6e9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                   </svg>
                </div>
                <div>
                  <p className="text-2xl font-serif italic text-[#2d3436]">The Archive is silent</p>
                  <p className="text-base text-[#636e72] mt-3 max-w-sm mx-auto">No captures match your current inquiry.</p>
                </div>
              </div>
            ) : (
              <div className={`space-y-16 transition-opacity duration-300 ${loading ? 'opacity-50' : 'opacity-100'}`}>
                <ScreenshotList
                  screenshots={screenshots}
                  onSelect={setSelected}
                  onRefresh={() => loadData(true)}
                />

                <div className="flex justify-center items-center gap-12 pb-16 border-t border-[#f1f2f6] pt-12">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-secondary px-12 py-3 text-base"
                  >
                    Previous
                  </button>
                  <span className="text-lg font-serif italic text-[#636e72]">
                    Folio <span className="text-[#2d3436] font-bold">{page}</span>
                  </span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages}
                    className="btn-secondary px-12 py-3 text-base"
                  >
                    Next
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </main>

      <OnboardingModal
        data={onboarding}
        onClose={() => setOnboarding(null)}
        onScanComplete={() => loadData(true)}
        onDismissed={() => loadData(true)}
        onStartBackgroundScan={() => {
            setScanning(true);
            setScanProgress({ queued: 0, total: onboarding?.unregistered || 0, done: 0, current_file: null });
        }}
      />
    </div>
  )
}
