import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { useStore } from '../store'

/**
 * Owns the Supabase auth session and keeps the store's live data in sync
 * with it — auth listener, an initial loadLiveData() once signed in, and a
 * refresh-on-visibility/focus/5-min-poll fallback for when the realtime
 * socket drops (mobile browsers freeze it in the background). Shared by the
 * main app shell and any standalone surface (e.g. a tablet kiosk view) that
 * needs the same signed-in-and-synced data without the full nav chrome.
 */
export function useLiveSession(): { session: Session | null; authChecked: boolean } {
  const [session, setSession] = useState<Session | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const { loadLiveData } = useStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadLiveData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(() => {
    if (!session) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadLiveData()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadLiveData()
    }, 5 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.clearInterval(id)
    }
  }, [session, loadLiveData])

  return { session, authChecked }
}
