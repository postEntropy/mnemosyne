import { describe, it, expect } from 'vitest'
import { normalizeTags, parseJsonObjectFromText, sanitizeSummary, sanitizeDescription, formatCaptureDateTime, normalizeTagInput, getThumbnailUrl, formatAppLabel } from './shared.ts'
import type { Screenshot } from '../types/index.ts'

describe('normalizeTags', () => {
  it('returns array as-is', () => {
    expect(normalizeTags(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('parses JSON string', () => {
    expect(normalizeTags('["a", "b"]')).toEqual(['a', 'b'])
  })

  it('returns empty for invalid input', () => {
    expect(normalizeTags(null)).toEqual([])
    expect(normalizeTags(42)).toEqual([])
    expect(normalizeTags('not-json')).toEqual([])
  })
})

describe('parseJsonObjectFromText', () => {
  it('parses pure JSON', () => {
    const result = parseJsonObjectFromText('{"key": "value"}')
    expect(result).toEqual({ key: 'value' })
  })

  it('extracts JSON from surrounding text', () => {
    const result = parseJsonObjectFromText('Here is some text {"key": "value"} and more')
    expect(result).toEqual({ key: 'value' })
  })

  it('returns null for invalid input', () => {
    expect(parseJsonObjectFromText('')).toBeNull()
    expect(parseJsonObjectFromText('not-json')).toBeNull()
  })
})

describe('sanitizeSummary', () => {
  it('returns filename when no summary/description', () => {
    const ss = { filename: 'test.png', summary: '', description: '' } as Screenshot
    expect(sanitizeSummary(ss)).toBe('test.png')
  })

  it('extracts summary from JSON', () => {
    const ss = { filename: 'test.png', summary: '{"summary": "Hello World"}', description: '' } as Screenshot
    expect(sanitizeSummary(ss)).toBe('Hello World')
  })
})

describe('sanitizeDescription', () => {
  it('returns filename when no description', () => {
    const ss = { filename: 'test.png', description: '', summary: '' } as Screenshot
    expect(sanitizeDescription(ss)).toBe('test.png')
  })
})

describe('formatCaptureDateTime', () => {
  it('formats a valid date', () => {
    const result = formatCaptureDateTime('2024-01-15T10:30:00Z')
    expect(result).toContain('Jan')
    expect(result).toContain('15')
  })

  it('returns "Unknown time" for invalid input', () => {
    expect(formatCaptureDateTime('')).toBe('Unknown time')
  })
})

describe('normalizeTagInput', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeTagInput('  hello   world  ')).toBe('hello world')
  })
})

describe('getThumbnailUrl', () => {
  it('returns null for null input', () => {
    expect(getThumbnailUrl(null)).toBeNull()
  })

  it('extracts filename and builds URL', () => {
    expect(getThumbnailUrl('/some/path/thumb.jpg')).toBe('/thumbnails/thumb.jpg')
  })
})

describe('formatAppLabel', () => {
  it('handles unknown apps', () => {
    expect(formatAppLabel('unknown')).toBe('Unknown app')
    expect(formatAppLabel('Unknown App')).toBe('Unknown app')
    expect(formatAppLabel('')).toBe('Unknown app')
  })

  it('returns known apps as-is', () => {
    expect(formatAppLabel('Chrome')).toBe('Chrome')
  })
})
