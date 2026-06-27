import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Orb from './Orb'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="card p-8 w-full max-w-sm flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Orb size={40} onTap={() => {}} onLongPress={() => {}} />
          <div>
            <div className="font-semibold text-lg">RICK-OS</div>
            <div className="text-xs text-faint">Personal operating system</div>
          </div>
        </div>

        {sent ? (
          <div className="flex flex-col gap-2 text-center">
            <p className="text-sm font-medium text-ink">Check your inbox</p>
            <p className="text-xs text-faint">
              Magic link sent to <span className="text-muted">{email}</span>. Click it to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <p className="text-sm text-muted">Sign in to access your data.</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
              className="input w-full"
            />
            {error && <p className="text-xs text-cross">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
