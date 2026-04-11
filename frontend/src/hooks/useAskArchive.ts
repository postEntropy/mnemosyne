import { useState, useCallback, useEffect } from 'react'
import { askArchive, getAskSuggestions } from '../api.ts'
import type { AskEntry, AskSuggestion, Screenshot } from '../types/index.ts'

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

interface UseAskArchiveReturn {
  askLoading: boolean
  askAnswer: string
  askMatches: Screenshot[]
  askContextItems: number
  askRetrievedItems: number
  askSuggestions: AskSuggestion[]
  askHistory: AskEntry[]
  activeAskHistoryId: number | null
  askQuestionSeed: string
  handleAskArchive: (question: string) => Promise<void>
  hydrateAskFromHistory: (entry: AskEntry) => void
  setActiveAskHistoryId: (id: number | null) => void
  setAskQuestionSeed: (q: string) => void
}

/**
 * Manages Ask Archive state: questions, answers, history, suggestions.
 */
export function useAskArchive(onError?: (msg: string) => void): UseAskArchiveReturn {
  const [askLoading, setAskLoading] = useState(false)
  const [askAnswer, setAskAnswer] = useState('')
  const [askMatches, setAskMatches] = useState<Screenshot[]>([])
  const [_askProvider, setAskProvider] = useState<string>('')
  const [askContextItems, setAskContextItems] = useState(0)
  const [askRetrievedItems, setAskRetrievedItems] = useState(0)
  const [askSuggestions, setAskSuggestions] = useState<AskSuggestion[]>([])
  const [askHistory, setAskHistory] = useState<AskEntry[]>(() => loadStoredAskHistory())
  const [activeAskHistoryId, setActiveAskHistoryId] = useState<number | null>(null)
  const [askQuestionSeed, setAskQuestionSeed] = useState('')

  // Persist history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ASK_HISTORY_STORAGE_KEY, JSON.stringify(askHistory))
    } catch {
      // Storage full or unavailable
    }
  }, [askHistory])

  // Refresh suggestions periodically
  useEffect(() => {
    let isUnmounted = false

    const loadSuggestions = async (refresh = false) => {
      try {
        const res = await getAskSuggestions(refresh)
        const suggestions = res?.data?.suggestions || []
        if (!isUnmounted) {
          setAskSuggestions(Array.isArray(suggestions) ? suggestions : [])
        }
      } catch {
        // Silently fail
      }
    }

    loadSuggestions(false)

    const interval = setInterval(() => {
      loadSuggestions(true)
    }, 480000)

    return () => {
      isUnmounted = true
      clearInterval(interval)
    }
  }, [])

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

  const handleAskArchive = useCallback(
    async (question: string) => {
      setAskLoading(true)
      try {
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
      } catch {
        onError?.('Nao foi possivel consultar o arquivo agora.')
      } finally {
        setAskLoading(false)
      }
    },
    [hydrateAskFromHistory, onError],
  )

  return {
    askLoading,
    askAnswer,
    askMatches,
    askContextItems,
    askRetrievedItems,
    askSuggestions,
    askHistory,
    activeAskHistoryId,
    askQuestionSeed,
    handleAskArchive,
    hydrateAskFromHistory,
    setActiveAskHistoryId,
    setAskQuestionSeed,
  }
}
