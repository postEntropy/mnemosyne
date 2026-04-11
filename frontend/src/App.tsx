import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from 'react'
import type { Screenshot, Stats, ScanProgress, OnboardingInfo, AskEntry, AskSuggestion, HealthCheck } from './types/index.ts'
import ScreenshotList from './components/ScreenshotList.tsx'
import SearchBar from './components/SearchBar.tsx'
import ScreenshotDetail from './components/ScreenshotDetail.tsx'
import Settings from './components/Settings.tsx'
import OnboardingModal from './components/OnboardingModal.tsx'
import AskArchivePanel from './components/AskArchivePanel.tsx'
import { getScreenshots, getScreenshot, getStats, getTags, scanFolder, getScanProgress, getOnboardingInfo, getSettings, getStatus, togglePause, toggleWatcherPause, getHealth, searchScreenshots, ignoreOnboardingPending, askArchive, getAskSuggestions, deleteScreenshot } from './api.ts'
import { normalizeTags, formatAppLabel } from './utils/shared.ts'

const ASK_HISTORY_STORAGE_KEY = 'mnemosyne.askHistory.v1'
const ASK_HISTORY_LIMIT = 60

function loadStoredAskHistory(): AskEntry[] {
  try {
    const raw = localStorage.getItem(ASK_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function App() {
  const PAGE_SIZE = 24
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [selected, setSelected] = useState<Screenshot | null>(null)
  const [routePath, setRoutePath] = useState<string>(() => window.location.pathname || '/')
  const [page, setPage] = useState<number>(1)
  const [hasMorePages, setHasMorePages] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [activeApps, setActiveApps] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [loadingMore, setLoadingMore] = useState<boolean>(false)
  const [scanning, setScanning] = useState<boolean>(false)
  const [paused, setPaused] = useState<boolean>(false)
  const [watcherPaused, setWatcherPaused] = useState<boolean>(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [onboarding, setOnboarding] = useState<OnboardingInfo | null>(null)
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(false)
  const [_health, setHealth] = useState<HealthCheck | null>(null)
  const [uiError, setUiError] = useState<string>('')
  const [showAsk, setShowAsk] = useState<boolean>(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [askLoading, setAskLoading] = useState<boolean>(false)
  const [askAnswer, setAskAnswer] = useState<string>('')
  const [askMatches, setAskMatches] = useState<Screenshot[]>([])
  const [_askProvider, setAskProvider] = useState<string>('')
  const [askContextItems, setAskContextItems] = useState<number>(0)
  const [askRetrievedItems, setAskRetrievedItems] = useState<number>(0)
  const [askSuggestions, setAskSuggestions] = useState<AskSuggestion[]>([])
  const [askHistory, setAskHistory] = useState<AskEntry[]>(() => loadStoredAskHistory())
  const [activeAskHistoryId, setActiveAskHistoryId] = useState<number | null>(null)
  const [askQuestionSeed, setAskQuestionSeed] = useState<string>('')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<Stats | null>(null)
  const autoRefreshInFlightRef = useRef<boolean>(false)
  const loadingMoreRef = useRef<boolean>(false)
  const loadMoreRequestRef = useRef<boolean>(false)
  const activeTagsRef = useRef<string[]>(activeTags)
  const activeAppsRef = useRef<string[]>(activeApps)

  useEffect(() => {
    try {
      localStorage.setItem(ASK_HISTORY_STORAGE_KEY, JSON.stringify(askHistory))
    } catch (e) {
      console.error(e)
    }
  }, [askHistory])

  const hydrateAskFromHistory = useCallback((entry: AskEntry) => {
    if (!entry) return
    setAskAnswer(entry.answer || '')
    setAskMatches(Array.isArray(entry.matches) ? entry.matches : [])
    setAskProvider(entry.provider || '')
    setAskContextItems(Number(entry.contextItems || 0))
    setAskRetrievedItems(Number(entry.retrievedItems || 0))
    setAskQuestionSeed(entry.question || '')
    setActiveAskHistoryId(entry.id)
  }, [])

  useEffect(() => {
    activeTagsRef.current = activeTags
  }, [activeTags])

  useEffect(() => {
    activeAppsRef.current = activeApps
  }, [activeApps])

  const navigate = useCallback((path: string) => {
    if (window.location.pathname === path) return
    window.history.pushState({}, '', path)
    setRoutePath(path)
  }, [])

  useEffect(() => {
    const onPopState = () => setRoutePath(window.location.pathname || '/')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!routePath.startsWith('/screenshot/')) {
      if (selected) setSelected(null)
      return
    }

    const idPart = routePath.split('/')[2]
    const screenshotId = Number(idPart)
    if (!Number.isFinite(screenshotId)) {
      window.history.replaceState({}, '', '/')
      setRoutePath('/')
      return
    }

    if (selected?.id === screenshotId) return

    const existing = screenshots.find((ss) => ss.id === screenshotId)
    if (existing) {
      setSelected(existing)
      return
    }

    getScreenshot(screenshotId)
      .then((res) => setSelected(res.data))
      .catch(() => {
        setUiError('Nao foi possivel abrir esta captura.')
        window.history.replaceState({}, '', '/')
        setRoutePath('/')
      })
  }, [routePath, screenshots, selected])

  useEffect(() => {
    if (routePath === '/ask') {
      setShowAsk(true)
      setStatusFilter(null)
      setActiveAskHistoryId(null)
      return
    }

    if (!routePath.startsWith('/ask/')) return

    setShowAsk(true)
    setStatusFilter(null)

    const askId = routePath.split('/')[2]
    const existing = askHistory.find((item) => String(item.id) === String(askId))
    if (existing) {
      hydrateAskFromHistory(existing)
      return
    }

    window.history.replaceState({}, '', '/ask')
    setRoutePath('/ask')
  }, [routePath, askHistory, hydrateAskFromHistory])

  const loadMeta = useCallback(async () => {
    try {
      const [statsRes, tagsRes, statusRes, healthRes] = await Promise.all([
        getStats(),
        getTags(),
        getStatus(),
        getHealth().catch(() => ({ data: null }))
      ])
      setStats(statsRes.data)
      setTags(tagsRes.data.tags)
      setPaused(statusRes.data.is_paused)
      setWatcherPaused(Boolean(statusRes.data.watcher_paused))
      setHealth(healthRes?.data)
      return {
        stats: statsRes.data,
      }
    } catch (e) {
      console.error(e)
      return null
    }
  }, [])

  const loadData = useCallback(async ({ reset = true, silent = false, query = searchQuery, refreshMeta = true, tags = activeTagsRef.current, apps = activeAppsRef.current }: { reset?: boolean; silent?: boolean; query?: string; refreshMeta?: boolean; tags?: string[]; apps?: string[] } = {}) => {
    const nextPage = reset ? 1 : page + 1

    if (reset && !silent) setLoading(true)
    if (!reset) setLoadingMore(true)
    if (!reset) loadingMoreRef.current = true

    try {
      setUiError('')

      const ssRes = query
        ? await searchScreenshots(query, nextPage, PAGE_SIZE)
        : await getScreenshots(nextPage, PAGE_SIZE, statusFilter, dateFrom, dateTo, tags, apps)

      const nextScreenshots = ssRes.data.screenshots || []
      const totalPages = ssRes.data.pages || 1

      setScreenshots((prev) => {
        if (reset) return nextScreenshots
        const existingIds = new Set(prev.map((ss) => ss.id))
        const deduped = nextScreenshots.filter((ss) => !existingIds.has(ss.id))
        return [...prev, ...deduped]
      })

      setPage(nextPage)
      setHasMorePages(nextPage < totalPages)

      if (reset && refreshMeta) {
        await loadMeta()
      }
    } catch (e) {
      console.error(e)
      setUiError('Unable to load archive data right now.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
      if (!reset) loadingMoreRef.current = false
    }
  }, [page, statusFilter, dateFrom, dateTo, searchQuery, loadMeta])

  useEffect(() => {
    statsRef.current = stats
  }, [stats])

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
          .then(() => loadData({ reset: true, silent: true }))
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
    let isUnmounted = false

    const loadSuggestions = async (refresh: boolean) => {
      try {
        const res = await getAskSuggestions(refresh)
        const suggestions = res?.data?.suggestions || []
        if (!isUnmounted) {
          setAskSuggestions(Array.isArray(suggestions) ? suggestions : [])
        }
      } catch (e) {
        console.error(e)
      }
    }

    loadSuggestions(false)

    if (!showAsk) {
      return () => {
        isUnmounted = true
      }
    }

    const interval = setInterval(() => {
      loadSuggestions(true)
    }, 480000)

    return () => {
      isUnmounted = true
      clearInterval(interval)
    }
  }, [showAsk])

  useEffect(() => {
    loadData({ reset: true })
  }, [loadData])

  // Background refresh + timeline sync for new watcher captures.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (autoRefreshInFlightRef.current) return
      autoRefreshInFlightRef.current = true
      try {
        const previousStats = statsRef.current
        const meta = await loadMeta()
        const nextStats = meta?.stats
        if (!nextStats) return

        const prevTotal = previousStats?.total ?? 0
        const nextTotal = nextStats.total ?? 0
        const prevActive = (previousStats?.pending ?? 0) + (previousStats?.processing ?? 0)
        const nextActive = (nextStats?.pending ?? 0) + (nextStats?.processing ?? 0)

        const shouldRefreshTimeline = nextTotal !== prevTotal || prevActive > 0 || nextActive > 0
        if (shouldRefreshTimeline) {
          await loadData({ reset: true, silent: true, refreshMeta: false })
        }
      } finally {
        autoRefreshInFlightRef.current = false
      }
    }, 8000)
    return () => clearInterval(interval)
  }, [loadMeta, loadData])

  useEffect(() => {
    if (showAsk || loading || !hasMorePages) return
    const sentinel = loadMoreRef.current
    const root = scrollContainerRef.current
    if (!sentinel || !root) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          if (loadingMoreRef.current || loadMoreRequestRef.current) return
          loadMoreRequestRef.current = true
          Promise.resolve(loadData({ reset: false, silent: true })).finally(() => {
            loadMoreRequestRef.current = false
          })
        }
      },
      { root, rootMargin: '240px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [showAsk, loading, hasMorePages, loadData])

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
          queued: prev?.queued ?? 0,
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
          loadData({ reset: true })
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

  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    setPage(1)
    setShowAsk(false)
    if (!q) {
      setActiveTags([])
      setActiveApps([])
      await loadData({ reset: true, query: '', tags: [], apps: [] })
      return
    }
    await loadData({ reset: true, query: q })
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm("Permanently remove this memory from the archive?")) return
    try {
      await deleteScreenshot(id)
      setSelected(null)
      loadData({ reset: true, silent: true })
    } catch (e) {
      console.error(e)
      setUiError('Nao foi possivel deletar a captura.')
    }
  }

  const handleTagClick = (tag: string) => {
    const nextActiveTags = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag]
    setPage(1)
    setSearchQuery('')
    setShowAsk(false)
    setActiveTags(nextActiveTags)
    loadData({ reset: true, query: '', tags: nextActiveTags, apps: activeAppsRef.current })
  }

  const handleAppClick = (app: string) => {
    const nextActiveApps = activeApps.includes(app)
      ? activeApps.filter((item) => item !== app)
      : [...activeApps, app]
    setPage(1)
    setSearchQuery('')
    setShowAsk(false)
    setActiveApps(nextActiveApps)
    loadData({ reset: true, query: '', tags: activeTagsRef.current, apps: nextActiveApps })
  }

  const conceptTags = useMemo(() => tags.filter((tag) => tag && tag !== '#'), [tags])
  const topApps = useMemo(() => (stats?.top_apps || []).filter((item) => item.app), [stats])
  const hasActiveFilter = activeTags.length > 0 || activeApps.length > 0
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const screenshot of screenshots) {
      for (const tag of normalizeTags(screenshot.tags)) {
        if (!tag || tag === '#') continue
        counts.set(tag, (counts.get(tag) || 0) + 1)
      }
    }
    return counts
  }, [screenshots])
  const sortedTopApps = useMemo(() => {
    return [...topApps].sort((a, b) => {
      const countDiff = (b.count || 0) - (a.count || 0)
      if (countDiff !== 0) return countDiff
      return a.app.localeCompare(b.app)
    })
  }, [topApps])
  const sortedConceptTags = useMemo(() => {
    return [...conceptTags].sort((a, b) => {
      const countDiff = (tagCounts.get(b) || 0) - (tagCounts.get(a) || 0)
      if (countDiff !== 0) return countDiff
      return a.localeCompare(b)
    })
  }, [conceptTags, tagCounts])

  const filteredScreenshots = screenshots

  const hasMatchForTag = useCallback((candidateTag: string) => {
    return screenshots.some((ss) => {
      const ssTags = normalizeTags(ss.tags)
      const matchesCurrentTags = activeTags.every((tag) => ssTags.includes(tag))
      const matchesCurrentApps = activeApps.length === 0 || activeApps.includes(ss.application || 'Unknown')
      return matchesCurrentTags && matchesCurrentApps && ssTags.includes(candidateTag)
    })
  }, [screenshots, activeTags, activeApps])

  const hasMatchForApp = useCallback((candidateApp: string) => {
    return screenshots.some((ss) => {
      const ssTags = normalizeTags(ss.tags)
      const matchesCurrentTags = activeTags.every((tag) => ssTags.includes(tag))
      const matchesCurrentApps = activeApps.length === 0 || activeApps.includes(ss.application || 'Unknown')
      return matchesCurrentTags && matchesCurrentApps && (ss.application || 'Unknown') === candidateApp
    })
  }, [screenshots, activeTags, activeApps])

  const openScreenshot = useCallback((screenshot: Screenshot) => {
    setSelected(screenshot)
    navigate(`/screenshot/${screenshot.id}`)
  }, [navigate])

  const closeScreenshot = useCallback(() => {
    setSelected(null)
    navigate('/')
  }, [navigate])

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
          queued: (prev?.queued ?? 0) + data.queued,
          total: data.total_new,
          done: prev?.done ?? 0,
          current_file: prev?.current_file ?? null,
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

  const handleToggleWatcherPause = async () => {
    try {
      const res = await toggleWatcherPause()
      setWatcherPaused(Boolean(res.data.watcher_paused))
    } catch (e) {
      console.error(e)
      setUiError('Nao foi possivel alternar pausa do watcher.')
    }
  }

  const handleAskArchive = async (question: string) => {
    setAskLoading(true)
    try {
      setUiError('')
      const res = await askArchive(question, 8)
      const entry: AskEntry = {
        id: Date.now(),
        question,
        answer: res.data.answer || '',
        matches: res.data.matches || [],
        provider: res.data.provider || '',
        contextItems: Number(res.data.context_items || 0),
        retrievedItems: Number(res.data.retrieved_items || 0),
        createdAt: new Date().toISOString(),
      }

      setAskHistory((prev) => [entry, ...prev].slice(0, ASK_HISTORY_LIMIT))
      hydrateAskFromHistory(entry)
      navigate(`/ask/${entry.id}`)
    } catch (e) {
      console.error(e)
      setUiError('Nao foi possivel consultar o arquivo agora.')
    } finally {
      setAskLoading(false)
    }
  }

  if (routePath === '/settings') {
    return <Settings onBack={() => navigate('/')} />
  }

  if (selected) {
    return (
      <ScreenshotDetail
        screenshot={selected}
        onClose={closeScreenshot}
        onRefresh={() => loadData({ reset: true, silent: true })}
        onDelete={handleDelete}
      />
    )
  }

  const navigation: { id: string | null; label: string; count?: number; icon: string }[] = [
    { id: 'ask', label: 'Ask Mnemosyne', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: null, label: 'All Memories', count: stats?.total, icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
    { id: 'processed', label: 'Analyzed', count: stats?.processed, icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'processing', label: 'In Progress', count: (stats?.processing || 0) + (stats?.pending || 0), icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'error', label: 'Fragments', count: stats?.errors, icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  ]

  return (
    <div className="flex h-screen bg-[#fdfcfb] overflow-hidden selection:bg-[#1a1c1d] selection:text-white">
      {/* SIDEBAR */}
      <aside className="w-72 border-r border-[#f0ede9] flex flex-col glass-strong z-20 relative">
        <div className="px-10 pt-10 pb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-[#1a1c1d] leading-none">Mnemosyne</h1>
            <p className="text-[10px] uppercase tracking-[0.35em] text-[#7f868d] font-bold opacity-80">The Memory Archive</p>
          </div>
          <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-[#f0ede9] to-transparent" role="presentation" />
        </div>

        <nav className="flex-grow overflow-y-auto px-6 space-y-10 custom-scrollbar pb-8 pt-2">
          {/* Main Navigation Section */}
          <div className="space-y-4">
            <p className="px-4 text-[10px] font-bold text-[#7f868d] uppercase tracking-[0.3em] opacity-80">Collections</p>
            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = (item.id === 'ask' && showAsk) || (statusFilter === item.id && !showAsk)

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'ask') {
                        setShowAsk(true)
                        setStatusFilter(null)
                        navigate('/ask')
                      } else {
                        setShowAsk(false)
                        setStatusFilter(item.id)
                        if (routePath.startsWith('/ask')) {
                          navigate('/')
                        }
                      }
                      setPage(1)
                      setSearchQuery('')
                      setActiveTags([])
                      setActiveApps([])
                    }}
                    className={`w-full relative overflow-hidden flex items-center justify-between pl-5 pr-4 py-3 rounded-2xl transition-all duration-500 group ${
                      isActive
                        ? 'bg-white/80 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.10)] border border-[#f0ede9] text-[#1a1c1d]'
                        : 'text-[#7f868d] hover:text-[#1a1c1d]'
                    }`}
                  >
                    <span
                      className={`absolute left-2 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full transition-all duration-500 ${
                        isActive ? 'bg-[#b45309] opacity-85' : 'bg-transparent opacity-0 group-hover:opacity-35 group-hover:bg-[#b45309]/28'
                      }`}
                    />
                    <div className="flex items-center gap-4 min-w-0">
                      <svg className={`w-5 h-5 flex-shrink-0 transition-colors duration-500 ${
                        isActive ? 'text-[#1a1c1d]' : 'text-[#a3abb2] group-hover:text-[#7f868d]'
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d={item.icon} />
                      </svg>
                      <span className="text-sm font-bold tracking-tight truncate">{item.label}</span>
                    </div>
                    {item.count !== undefined && (
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                        isActive
                          ? 'bg-white border-[#f0ede9] text-[#1a1c1d] opacity-90'
                          : 'bg-transparent border-transparent text-[#7f868d] opacity-70 group-hover:bg-white group-hover:border-[#f0ede9]'
                      }`}>
                        {item.count.toLocaleString()}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </nav>

        {/* Footer Actions */}
        <div className="p-7 border-t border-[#f0ede9] glass-soft space-y-3">
          <p className="px-1 text-[10px] font-bold text-[#7f868d] uppercase tracking-[0.3em] opacity-80">Actions</p>
          {scanning && scanProgress && (
            <div className="px-2 mb-6 space-y-3">
               <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-[#7f868d] uppercase tracking-widest">
                    <span>{paused ? 'Memories Paused' : 'Restoring Memories'}</span>
                    <span>{Math.round((scanProgress.done/scanProgress.total)*100 || 0)}%</span>
                  </div>
                  <div className="w-full bg-[#f0ede9] h-1 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ease-out ${paused ? 'bg-[#c9c7c3]' : 'bg-[#1a1c1d]'}`}
                      style={{width: `${(scanProgress.done/scanProgress.total)*100 || 0}%`}}
                    />
                  </div>
               </div>

               <button
                 onClick={handleTogglePause}
                 className="w-full text-[10px] font-bold text-[#7f868d] hover:text-[#1a1c1d] uppercase tracking-widest transition py-1"
               >
                  {paused ? 'Resume Analysis' : 'Pause Analysis'}
               </button>
            </div>
          )}
          <button
            onClick={handleScanFolder}
            disabled={scanning}
            className="w-full btn-secondary text-[10px] py-2.5"
          >
            {scanning ? (paused ? 'Archive Paused' : 'Flux...') : 'Scan Library'}
          </button>
          <button
            onClick={handleToggleWatcherPause}
            className="w-full btn-secondary text-[10px] py-2.5"
          >
            {watcherPaused ? 'Resume Watcher' : 'Pause Watcher'}
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-full btn-primary text-[10px] py-2.5"
          >
            Settings
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-grow flex flex-col min-w-0 bg-[#fdfcfb]/90 backdrop-blur-md relative overflow-hidden">
        {showAsk && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(180,83,9,0.05),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(26,28,29,0.04),transparent_50%)]" />
          </>
        )}
        <div
          ref={scrollContainerRef}
          className={`flex-grow overflow-y-auto custom-scrollbar ${showAsk ? 'p-0' : 'p-12 md:p-16'}`}
        >
          {showAsk && (
            <AskArchivePanel
              onAsk={handleAskArchive}
              loading={askLoading}
              answer={askAnswer}
              matches={askMatches}
              suggestions={askSuggestions}
              contextItems={askContextItems}
              retrievedItems={askRetrievedItems}
              dbTokenEstimate={Number(stats?.db_total_tokens_estimate || 0)}
              dbTokenUpdatedAt={stats?.token_count_updated_at || ''}
              dbTokenizerName={stats?.tokenizer_name || ''}
              historyEntries={askHistory}
              activeHistoryId={activeAskHistoryId}
              initialQuestion={askQuestionSeed}
              onSelectHistory={(entryId) => {
                const selectedEntry = askHistory.find((item) => item.id === entryId)
                if (!selectedEntry) return
                hydrateAskFromHistory(selectedEntry)
                navigate(`/ask/${selectedEntry.id}`)
              }}
              onOpenMatch={openScreenshot}
              dateFrom={dateFrom}
              setDateFrom={(v) => { setDateFrom(v); setPage(1); }}
              dateTo={dateTo}
              setDateTo={(v) => { setDateTo(v); setPage(1); }}
            />
          )}

          {uiError && (
            <div className="mb-8 rounded-2xl border border-[#f0ede9] bg-white/70 backdrop-blur-sm px-6 py-5 text-[11px] text-[#1a1c1d] font-serif italic tracking-tight shadow-[0_12px_30px_-18px_rgba(15,23,42,0.12)] animate-in fade-in duration-500">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-[#f0ede9] bg-[#fcfaf7] text-[#b45309]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 4h.01M10.29 3.86l-7.4 12.81A2 2 0 004.62 20h14.76a2 2 0 001.73-3.33l-7.4-12.81a2 2 0 00-3.46 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#94999e] not-italic">Archive Notice</p>
                  <p className="mt-1 whitespace-pre-wrap">{uiError}</p>
                </div>
              </div>
            </div>
          )}

          {!showAsk && (
            <div className="mb-12 flex items-center justify-between border-b border-[#f0ede9] pb-8">
              <div>
                <p className="text-[10px] font-bold text-[#94999e] uppercase tracking-[0.4em]">Archive Timeline</p>
                <h2 className="text-2xl font-serif italic text-[#1a1c1d] mt-1">Historical Perspective</h2>
              </div>
              <div className="flex items-center gap-3 w-full max-w-4xl justify-end">
                <div className="flex items-center gap-1 rounded-2xl border border-[#ece7dd] bg-white/80 p-1.5 shadow-sm">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`h-9 w-9 rounded-xl transition-all duration-300 flex items-center justify-center ${
                      viewMode === 'grid'
                        ? 'bg-[#1a1c1d] text-white'
                        : 'text-[#7f868d] hover:text-[#1a1c1d] hover:bg-white'
                    }`}
                    aria-label="Grid view"
                    title="Grid view"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`h-9 w-9 rounded-xl transition-all duration-300 flex items-center justify-center ${
                      viewMode === 'list'
                        ? 'bg-[#1a1c1d] text-white'
                        : 'text-[#7f868d] hover:text-[#1a1c1d] hover:bg-white'
                    }`}
                    aria-label="List view"
                    title="List view"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
                    </svg>
                  </button>
                </div>
                <SearchBar onSearch={handleSearch} query={searchQuery} />
              </div>
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
              <div className={`space-y-10 transition-all duration-500 ${loading ? 'opacity-50' : 'opacity-100'} ${showAsk ? 'mt-12 md:mt-16 pb-16' : ''}`}>
                <div className={(conceptTags.length > 0 || topApps.length > 0) ? 'space-y-6' : ''}>
                  {(conceptTags.length > 0 || topApps.length > 0) && (
                    <div className="px-5 md:px-8 xl:px-12 2xl:px-16">
                      <div className="rounded-2xl border border-[#ece7dd] bg-white/62 backdrop-blur-md px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {sortedTopApps.slice(0, 10).map((item) => (
                            <button
                              key={item.app}
                              onClick={() => handleAppClick(item.app)}
                              disabled={hasActiveFilter && !activeApps.includes(item.app) && !hasMatchForApp(item.app)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-500 ${
                                activeApps.includes(item.app)
                                  ? 'bg-[#9a3412] text-white border border-[#9a3412] shadow-[0_8px_20px_-14px_rgba(154,52,18,0.6)]'
                                  : hasActiveFilter && !hasMatchForApp(item.app)
                                    ? 'bg-[#fff4ea]/50 text-[#c9a98e] border border-[#f3dcc7]/60 opacity-60 cursor-not-allowed'
                                    : 'bg-[#fff4ea] text-[#9a4d18] border border-[#efd4bb] hover:border-[#c2410c] hover:text-[#c2410c] hover:bg-[#ffeddc]'
                              }`}
                              title={`${item.count} captures`}
                            >
                              <span>{formatAppLabel(item.app)}</span>
                              <span className={`text-[9px] font-semibold leading-none tracking-tight ${
                                activeApps.includes(item.app)
                                  ? 'text-white/85'
                                  : 'text-[#9a4d18]/70'
                              }`}>
                                {item.count}
                              </span>
                            </button>
                          ))}

                          {sortedConceptTags.slice(0, 18).map((tag) => (
                            <button
                              key={tag}
                              onClick={() => handleTagClick(tag)}
                              disabled={hasActiveFilter && !activeTags.includes(tag) && !hasMatchForTag(tag)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-500 ${
                                activeTags.includes(tag)
                                  ? 'bg-[#1a1c1d] text-white'
                                  : hasActiveFilter && !hasMatchForTag(tag)
                                    ? 'bg-white/60 text-[#c3c8cf] border border-[#ece7dd]/60 opacity-60 cursor-not-allowed'
                                    : 'bg-white/80 text-[#7f868d] border border-[#ece7dd] hover:border-[#1a1c1d] hover:text-[#1a1c1d]'
                              }`}
                            >
                              <span>#{tag}</span>
                              <span className={`text-[9px] font-semibold leading-none tracking-tight ${
                                activeTags.includes(tag)
                                  ? 'text-white/85'
                                  : 'text-[#7f868d]/70'
                              }`}>
                                {tagCounts.get(tag) || 0}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <ScreenshotList
                    screenshots={filteredScreenshots}
                    onSelect={openScreenshot}
                    onRefresh={() => loadData({ reset: true, silent: true })}
                    onDelete={handleDelete}
                    viewMode={viewMode}
                  />
                </div>

                <div className="pb-16 border-t border-[#f1f2f6] pt-10 space-y-4">
                  <div ref={loadMoreRef} className="h-1" />
                  {loadingMore && (
                    <div className="flex items-center justify-center gap-3 text-[#7f868d]">
                      <div className="w-5 h-5 border-2 border-[#1a1c1d] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Loading more memories</span>
                    </div>
                  )}
                  {!hasMorePages && screenshots.length > 0 && (
                    <p className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-[#94999e]">End of archive</p>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Global Archive Range Pill - Fixed at bottom of main area, only visible in Gallery */}
        {!showAsk && (
          <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center pointer-events-none z-40">
             <div className="flex items-center gap-10 bg-white/95 backdrop-blur-2xl border border-[#e8e2d9] px-10 py-5 rounded-3xl shadow-[0_20px_50px_-15px_rgba(15,23,42,0.12)] hover:shadow-[0_40px_80px_-20px_rgba(15,23,42,0.18)] hover:border-[#1a1c1d]/20 transition-all duration-700 pointer-events-auto group">
                <span className="text-[10px] font-bold text-[#b45309] uppercase tracking-[0.4em] transition-colors opacity-80">Archive Range</span>
                <div className="flex items-center gap-6">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => { setDateFrom(e.target.value); setPage(1); }}
                      className="bg-transparent border-none text-[13px] text-[#1a1c1d] focus:ring-0 p-0 w-32 font-serif italic font-bold"
                    />
                    <div className="w-px h-5 bg-[#e8e2d9]" />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => { setDateTo(e.target.value); setPage(1); }}
                      className="bg-transparent border-none text-[13px] text-[#1a1c1d] focus:ring-0 p-0 w-32 font-serif italic font-bold"
                    />
                </div>
             </div>
          </div>
        )}
      </main>

      <OnboardingModal
        data={onboarding}
        onClose={() => setOnboarding(null)}
        onScanComplete={() => loadData({ reset: true, silent: true })}
        onDismissed={() => loadData({ reset: true, silent: true })}
        onStartBackgroundScan={() => {
            setScanning(true);
            setScanProgress({ queued: 0, total: onboarding?.unregistered || 0, done: 0, current_file: null });
        }}
      />
    </div>
  )
}
