import { useState, useCallback, useEffect } from 'react'

/**
 * Manages browser history-based navigation without React Router.
 */
export function useNavigation() {
  const [routePath, setRoutePath] = useState(() => window.location.pathname || '/')

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

  return { routePath, navigate }
}
