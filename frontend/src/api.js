import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

export const getScreenshots = (page = 1, limit = 20, status = null, dateFrom = '', dateTo = '') => {
  const params = { page, limit }
  if (status) params.status = status
  if (dateFrom) params.date_from = dateFrom
  if (dateTo) params.date_to = dateTo
  return api.get('/screenshots', { params })
}

export const getScreenshotCount = (status = null) => {
  const params = status ? { status } : {}
  return api.get('/screenshots/count', { params })
}

export const getScreenshot = (id) => api.get(`/screenshots/${id}`)

export const searchScreenshots = (q, page = 1, limit = 20) =>
  api.get('/screenshots/search', { params: { q, page, limit } })

export const getTags = () => api.get('/screenshots/tags')

export const getStats = () => api.get('/screenshots/stats')

export const rescanScreenshot = (id) => api.post(`/screenshots/${id}/rescan`)

export const deleteScreenshot = (id) => api.delete(`/screenshots/${id}`)

export const getSettings = () => api.get('/settings')

export const updateSettings = (data) => api.put('/settings', data)

export const testConnection = (data = {}) => api.post('/settings/test', data)

export const getStatus = () => api.get('/status')

export const togglePause = () => api.post('/status/toggle-pause')

export const toggleWatcherPause = () => api.post('/status/toggle-watcher')

export const scanFolder = (batchSize = 50, batchIndex = 0) =>
  api.post('/screenshots/scan-folder', null, { params: { batch_size: batchSize, batch_index: batchIndex } })

export const getScanProgress = () => api.get('/screenshots/scan-progress')

export const getOnboardingInfo = () => api.get('/screenshots/onboarding')

export const ignoreOnboardingPending = () => api.post('/screenshots/onboarding/ignore-pending')

export const askArchive = (question, limit = 8) =>
  api.post('/screenshots/ask-archive', { question, limit })

export const getHealth = () => api.get('/health')

export default api
