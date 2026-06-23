import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-canvas">
        <div className="card p-6 max-w-lg w-full">
          <h2 className="text-lg font-semibold text-cross mb-2">Something went wrong</h2>
          <pre className="text-xs text-muted bg-sunken rounded-xl p-4 overflow-auto whitespace-pre-wrap">
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
          <button
            className="btn-primary mt-4"
            onClick={() => {
              localStorage.clear()
              window.location.reload()
            }}
          >
            Clear cache & reload
          </button>
        </div>
      </div>
    )
  }
}
