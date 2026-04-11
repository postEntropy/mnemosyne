import { useState, useCallback, useEffect } from 'react'

/**
 * Manages browser history-based navigation without React Router.
 * Keeps `routePath` state in sync with `window.location.pathname`.
 */
export function useNavigation() {
  const [routePath, setRoutePath] = useState(() => window.location.pathname || '/')

  const navigate = useCallback((path: string) => {
    if (window.location.pathname === path) return
    window.history.pushState({}, '', path)
    setRoutePath(path)
  }, [])

  /**
   * Replace the current URL without adding a history entry.
   * Use this instead of raw `window.history.replaceState` to keep state in sync.
   */
  const replaceNavigate = useCallback((path: string) => {
    window.history.replaceState({}, '', path)
    setRoutePath(path)
  }, [])

  useEffect(() => {
    const onPopState = () => setRoutePath(window.location.pathname || '/')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return { routePath, navigate, replaceNavigate }
}
