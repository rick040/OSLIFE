import { useEffect, useRef } from 'react'
import { currentUserId } from '../lib/supabase'
import { fetchLiveRecord, subscribeLiveWorkout, type LiveRecord } from './liveSession'

// A request older than this is a leftover from when no screen was listening.
const FRESH_MS = 5 * 60 * 1000

/**
 * The gym screen has no input, so while it sits idle it listens for the phone
 * asking it to start a plan (a `workout_live` row with status 'requested').
 * `onRequest` gets the plan id once per request. Only requests newer than what
 * we saw when we started listening count, plus one already-pending fresh
 * request, so a stale row from last week can't start a workout by itself.
 */
export function useLiveStartRequests(enabled: boolean, onRequest: (planId: string) => void) {
  const onRequestRef = useRef(onRequest)
  onRequestRef.current = onRequest

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    let handledRev = 0

    const consider = (rec: LiveRecord) => {
      if (rec.rev <= handledRev) return
      // A tab nobody is looking at (e.g. a stale /tablet/workout left open in a
      // phone browser) must not answer: two screens would both open the workout
      // and fight over it. Leave the request unhandled; we re-check on becoming visible.
      if (document.visibilityState === 'hidden') return
      handledRev = rec.rev
      if (rec.status !== 'requested' || !rec.state.planId) return
      if (rec.updatedAt && Date.now() - Date.parse(rec.updatedAt) > FRESH_MS) return
      onRequestRef.current(rec.state.planId)
    }

    void (async () => {
      const userId = await currentUserId()
      if (cancelled || !userId) return
      unsubscribe = subscribeLiveWorkout(userId, {
        onRecord: consider,
        // (Re)connected, or a payload we couldn't parse: look at the row itself.
        onResync: () => void fetchLiveRecord().then((rec) => !cancelled && rec && consider(rec)),
        onConnection: () => {},
      })
    })()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchLiveRecord().then((rec) => !cancelled && rec && consider(rec))
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      unsubscribe?.()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
}
