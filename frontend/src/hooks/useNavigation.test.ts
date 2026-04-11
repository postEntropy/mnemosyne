import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNavigation } from './useNavigation.ts'

describe('useNavigation', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('initializes with current pathname', () => {
    window.history.replaceState({}, '', '/ask')
    const { result } = renderHook(() => useNavigation())
    expect(result.current.routePath).toBe('/ask')
  })

  it('navigate pushes to history and updates state', () => {
    const { result } = renderHook(() => useNavigation())

    act(() => {
      result.current.navigate('/settings')
    })

    expect(result.current.routePath).toBe('/settings')
    expect(window.location.pathname).toBe('/settings')
  })

  it('replaceNavigate updates both URL and state in sync', () => {
    const { result } = renderHook(() => useNavigation())

    act(() => {
      result.current.navigate('/ask')
    })
    expect(result.current.routePath).toBe('/ask')

    act(() => {
      result.current.replaceNavigate('/ask/123')
    })

    expect(result.current.routePath).toBe('/ask/123')
    expect(window.location.pathname).toBe('/ask/123')
  })

  it('does nothing when navigating to same path', () => {
    const { result } = renderHook(() => useNavigation())

    const pushState = vi.spyOn(window.history, 'pushState')

    act(() => {
      result.current.navigate('/')
    })

    expect(pushState).not.toHaveBeenCalled()
    pushState.mockRestore()
  })

  it('updates routePath when popstate event fires', () => {
    const { result } = renderHook(() => useNavigation())

    act(() => {
      result.current.navigate('/ask')
      result.current.navigate('/settings')
    })

    expect(result.current.routePath).toBe('/settings')

    // jsdom doesn't fire real popstate, so we dispatch it manually
    act(() => {
      window.history.replaceState({}, '', '/ask')
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
    })

    expect(result.current.routePath).toBe('/ask')
  })
})
