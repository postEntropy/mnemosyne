import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { getScreenshots, getScreenshot, getStats, getTags, getStatus, getHealth, searchScreenshots } from '../api.ts'
import type { Screenshot, Stats } from '../types/index.ts'

function normalizeTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) return rawTags as string[]
  if (typeof rawTags !== 'string') return []
  try {
    const parsed = JSON.parse(rawTags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

interface UseArchiveFilters {
  statusFilter: string | null
  dateFrom: string
  dateTo: string
  activeTags: string[]
  activeApps: string[]
  searchQuery: string
  setStatusFilter: (s: string | null) => void
  setDateFrom: (d: string) => void
  setDateTo: (d: string) => void
  setActiveTags: (tags: string[]) => void
  setActiveApps: (apps: string[]) => void
  setSearchQuery: (q: string) => void
}

interface UseArchiveReturn {
  screenshots: Screenshot[]
  stats: Stats | null
  tags: string[]
  page: number
  hasMorePages: boolean
  loading: boolean
  loadingMore: boolean
  showAsk: boolean
  viewMode: 'grid' | 'list'
  uiError: string
  filters: UseArchiveFilters
  loadData: (options?: { reset?: boolean; silent?: boolean; query?: string; refreshMeta?: boolean; tags?: string[]; apps?: string[] }) => Promise<void>
  loadMeta: () => Promise<{ stats: Stats } | null>
  setShowAsk: (v: boolean) => void
  setViewMode: (v: 'grid' | 'list') => void
  setUiError: (msg: string) => void
  setPage: (p: number) => void
}

const PAGE_SIZE = 24

/**
 * Manages archive data loading, filtering, pagination, and infinite scroll.
 */
export function useArchive(initialStatusFilter: string | null = null): UseArchiveReturn {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [hasMorePages, setHasMorePages] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string | null>(initialStatusFilter)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [activeApps, setActiveApps] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showAsk, setShowAsk] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [uiError, setUiError] = useState('')

  const statsRef = useRef<Stats | null>(null)
  const activeTagsRef = useRef(activeTags)
  const activeAppsRef = useRef(activeApps)
  const loadingMoreRef = useRef(false)
  const loadMoreRequestRef = useRef(false)

  useEffect(() => {
    activeTagsRef.current = activeTags
  }, [activeTags])

  useEffect(() => {
    activeAppsRef.current = activeApps
  }, [activeApps])

  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  const loadMeta = useCallback(async () => {
    try {
      const [statsRes, tagsRes, statusRes, healthRes] = await Promise.all([
        getStats(),
        getTags(),
        getStatus(),
        getHealth().catch(() => ({ data: null })),
      ])
      setStats(statsRes.data)
      setTags(tagsRes.data.tags)
      return { stats: statsRes.data }
    } catch {
      return null
    }
  }, [])

  const loadData = useCallback(
    async ({
      reset = true,
      silent = false,
      query = searchQuery,
      refreshMeta = true,
      tags = activeTagsRef.current,
      apps = activeAppsRef.current,
    } = {}) => {
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
      } catch {
        setUiError('Unable to load archive data right now.')
      } finally {
        setLoading(false)
        setLoadingMore(false)
        if (!reset) loadingMoreRef.current = false
      }
    },
    [page, statusFilter, dateFrom, dateTo, searchQuery, loadMeta],
  )

  // Background refresh for new captures
  useEffect(() => {
    const interval = setInterval(async () => {
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
        // No-op
      }
    }, 8000)
    return () => clearInterval(interval)
  }, [loadMeta, loadData])

  const filters = useMemo<UseArchiveFilters>(
    () => ({
      statusFilter,
      dateFrom,
      dateTo,
      activeTags,
      activeApps,
      searchQuery,
      setStatusFilter,
      setDateFrom,
      setDateTo,
      setActiveTags,
      setActiveApps,
      setSearchQuery,
    }),
    [statusFilter, dateFrom, dateTo, activeTags, activeApps, searchQuery],
  )

  return {
    screenshots,
    stats,
    tags,
    page,
    hasMorePages,
    loading,
    loadingMore,
    showAsk,
    viewMode,
    uiError,
    filters,
    loadData,
    loadMeta,
    setShowAsk,
    setViewMode,
    setUiError,
    setPage,
  }
}
