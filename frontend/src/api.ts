import type {
  Screenshot,
  Stats,
  Settings,
  ScanProgress,
  OnboardingInfo,
  AskSuggestion,
  HealthCheck,
  StatusInfo,
} from '../types/index.ts'
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

export const getScreenshots = (
  page = 1,
  limit = 20,
  status: string | null = null,
  dateFrom = '',
  dateTo = '',
  tags: string[] = [],
  apps: string[] = [],
) => {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))
  if (status) params.set('status', status)
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  tags.filter(Boolean).forEach((tag) => params.append('tags', tag))
  apps.filter(Boolean).forEach((app) => params.append('apps', app))
  return api.get<{ screenshots: Screenshot[]; pages: number }>('/screenshots', { params })
}

export const getScreenshotCount = (status: string | null = null) => {
  const params = status ? { status } : {}
  return api.get<{ count: number }>('/screenshots/count', { params })
}

export const getScreenshot = (id: number) => api.get<Screenshot>(`/screenshots/${id}`)

export const searchScreenshots = (q: string, page = 1, limit = 20) =>
  api.get<{ screenshots: Screenshot[]; pages: number }>('/screenshots/search', { params: { q, page, limit } })

export const getTags = () => api.get<{ tags: string[] }>('/screenshots/tags')

export const getStats = () => api.get<Stats>('/screenshots/stats')

export const rescanScreenshot = (id: number) => api.post(`/screenshots/${id}/rescan`)

export const updateScreenshotTags = (id: number, tags: string[]) =>
  api.put<{ screenshot: Screenshot }>(`/screenshots/${id}/tags`, { tags })

export const deleteScreenshot = (id: number) => api.delete(`/screenshots/${id}`)

export const getSettings = () => api.get<Settings>('/settings')

export const updateSettings = (data: Partial<Settings>) => api.put('/settings', data)

export const testConnection = (data: Record<string, unknown> = {}) =>
  api.post<{ success: boolean; message: string }>('/settings/test', data)

export const getStatus = () => api.get<StatusInfo>('/status')

export const togglePause = () => api.post<{ is_paused: boolean }>('/status/toggle-pause')

export const toggleWatcherPause = () =>
  api.post<{ watcher_paused: boolean }>('/status/toggle-watcher')

export const scanFolder = (batchSize = 50, batchIndex = 0) =>
  api.post<{ queued: number; total_new: number; has_more: boolean }>(
    '/screenshots/scan-folder',
    null,
    { params: { batch_size: batchSize, batch_index: batchIndex } },
  )

export const getScanProgress = () =>
  api.get<{ total: number; processed: number; errors: number; pending: number; current_file: string | null }>(
    '/screenshots/scan-progress',
  )

export const getOnboardingInfo = () => api.get<OnboardingInfo>('/screenshots/onboarding')

export const ignoreOnboardingPending = () =>
  api.post('/screenshots/onboarding/ignore-pending')

export const askArchive = (question: string, limit = 8) =>
  api.post<{ answer: string; matches: Screenshot[]; provider: string; context_items: number; retrieved_items: number }>(
    '/screenshots/ask-archive',
    { question, limit },
  )

export const getAskSuggestions = (refresh = false) =>
  api.get<{ suggestions: AskSuggestion[] }>('/screenshots/ask-suggestions', { params: { refresh } })

export const getHealth = () => api.get<HealthCheck>('/health')

export default api
