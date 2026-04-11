import { Component } from 'react'

/**
 * Catches render errors in child components and displays a fallback UI.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-8 pt-20 p-8">
          <div className="w-32 h-32 bg-[#fcfaf7] rounded-full flex items-center justify-center border border-[#f0ede9]">
            <svg className="w-12 h-12 text-[#dfe6e9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-serif italic text-[#2d3436]">Something went wrong</p>
            <p className="text-base text-[#636e72] mt-3 max-w-sm mx-auto">
              The archive encountered an unexpected error. Please try refreshing.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 btn-secondary px-8 py-3"
            >
              Reload Archive
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
