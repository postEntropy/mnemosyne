/**
 * Parse a JSON string that may contain surrounding text.
 * Handles: pure JSON, JSON with leading/trailing text, malformed wrappers.
 */
export function parseJsonObjectFromText(text) {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed) return null

  // Try direct parse if it starts with '{'
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      // Fall through to extraction.
    }
  }

  // Extract between first '{' and last '}'
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Normalize tags from various formats (array, JSON string, plain string) into a string array.
 */
export function normalizeTags(rawTags) {
  if (Array.isArray(rawTags)) return rawTags
  if (typeof rawTags !== 'string') return []

  try {
    const parsed = JSON.parse(rawTags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Extract a human-readable summary from a screenshot object.
 * Tries summary JSON, description JSON, then raw text, then filename.
 */
export function sanitizeSummary(screenshot) {
  const rawSummary = (screenshot.summary || '').trim()
  const parsedSummary = parseJsonObjectFromText(rawSummary)
  if (parsedSummary && typeof parsedSummary.summary === 'string' && parsedSummary.summary.trim()) {
    return parsedSummary.summary.trim()
  }
  if (parsedSummary && typeof parsedSummary.description === 'string' && parsedSummary.description.trim()) {
    return parsedSummary.description.trim().slice(0, 140)
  }
  if (rawSummary && !rawSummary.startsWith('{')) {
    return rawSummary
  }

  const rawDescription = (screenshot.description || '').trim()
  const parsedDescription = parseJsonObjectFromText(rawDescription)
  if (parsedDescription && typeof parsedDescription.summary === 'string' && parsedDescription.summary.trim()) {
    return parsedDescription.summary.trim()
  }
  if (parsedDescription && typeof parsedDescription.description === 'string' && parsedDescription.description.trim()) {
    return parsedDescription.description.trim().slice(0, 140)
  }

  return screenshot.filename
}

/**
 * Extract a human-readable description from a screenshot object.
 */
export function sanitizeDescription(screenshot) {
  const rawDescription = (screenshot.description || '').trim()
  const parsedDescription = parseJsonObjectFromText(rawDescription)
  if (parsedDescription && typeof parsedDescription.description === 'string' && parsedDescription.description.trim()) {
    return parsedDescription.description.trim()
  }
  if (rawDescription && !rawDescription.startsWith('{')) {
    return rawDescription
  }

  const rawSummary = (screenshot.summary || '').trim()
  const parsedSummary = parseJsonObjectFromText(rawSummary)
  if (parsedSummary && typeof parsedSummary.description === 'string' && parsedSummary.description.trim()) {
    return parsedSummary.description.trim()
  }
  if (parsedSummary && typeof parsedSummary.summary === 'string' && parsedSummary.summary.trim()) {
    return parsedSummary.summary.trim()
  }

  return screenshot.filename
}

/**
 * Format a timestamp into a human-readable capture date/time.
 */
export function formatCaptureDateTime(timestamp, includeYear = false) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Unknown time'

  const datePart = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  })

  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return `${datePart} \u2022 ${timePart}`
}

/**
 * Build a normalized AI display object from a screenshot.
 */
export function buildAiDisplay(item) {
  return {
    summary: sanitizeSummary(item),
    description: sanitizeDescription(item),
    tags: normalizeTags(item?.tags),
  }
}

/**
 * Deep equality check for AI display objects.
 */
export function sameAiDisplay(a, b) {
  if (!a || !b) return false
  if (a.summary !== b.summary) return false
  if (a.description !== b.description) return false
  if ((a.tags || []).length !== (b.tags || []).length) return false
  return (a.tags || []).every((tag, idx) => tag === b.tags[idx])
}

/**
 * Normalize tag input: trim and collapse whitespace.
 */
export function normalizeTagInput(value) {
  return (value || '').trim().replace(/\s+/g, ' ')
}

/**
 * Generate a thumbnail URL from a screenshot's thumbnail_path.
 */
export function getThumbnailUrl(thumbnailPath) {
  if (!thumbnailPath) return null
  const fileName = thumbnailPath.split('/').pop()
  return `/thumbnails/${fileName}`
}

/**
 * Format an app label for display (handles unknown/missing app names).
 */
export function formatAppLabel(app) {
  const normalized = String(app || '').trim().toLowerCase()
  if (['unknown', 'unknown app', 'app not detected', 'capture'].includes(normalized)) {
    return 'Unknown app'
  }
  return app
}
