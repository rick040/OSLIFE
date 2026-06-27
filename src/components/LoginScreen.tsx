import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Orb from './Orb'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mailadres"
            required
            autoFocus
            className="input w-full"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wachtwoord"
            required
            className="input w-full"
          />
          {error && <p className="text-xs text-cross">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? 'Inloggen…' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  )
}
