import { useEffect, useRef, useState } from 'react'
import { currentUserId } from '../lib/supabase'
import {
  endLiveWorkout,
  fetchLiveRecord,
  fingerprint,
  subscribeLiveWorkout,
  writeLiveProgress,
  writeLiveWorkout,
  type LiveConnection,
  type LiveRecord,
  type LiveWorkout,
} from './liveSession'

const DEBOUNCE_MS = 150

const newClientId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)

/**
 * Keeps one device's workout state and the shared `workout_live` row in sync.
 *
 * - 'screen' owns the workout: it publishes its state on start, ignores
 *   whatever stale row was there before, and marks the row 'ended' when it
 *   unmounts (saved or abandoned).
 * - 'remote' (the phone) starts with no state, adopts the row, and afterwards
 *   writes only progress changes.
 *
 * Local changes are debounced into one write; remote changes (anyone but us,
 * newer `rev` than anything seen) are handed to `onRemote`. Applying a remote
 * state makes our fingerprint equal the row's, so it is never published back.
 */
export function useLiveWorkoutSync({
  enabled,
  mode,
  state,
  onRemote,
}: {
  enabled: boolean
  mode: 'screen' | 'remote'
  /** Local state to publish; null until the remote side has supplied one. */
  state: LiveWorkout | null
  onRemote: (rec: LiveRecord) => void
}): { connection: LiveConnection; loaded: boolean } {
  const [connection, setConnection] = useState<LiveConnection>('connecting')
  const [loaded, setLoaded] = useState(false)
  const [ready, setReady] = useState(false)

  const clientId = useRef(newClientId())
  const stateRef = useRef(state)
  stateRef.current = state
  const onRemoteRef = useRef(onRemote)
  onRemoteRef.current = onRemote
  const syncedFp = useRef<string | null>(null)
  const lastRev = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  const flush = useRef(async () => {})
  flush.current = async () => {
    timer.current = undefined
    const s = stateRef.current
    if (!s) return
    const fp = fingerprint(s)
    if (fp === syncedFp.current) return
    syncedFp.current = fp
    const ok = mode === 'screen' ? await writeLiveWorkout(s, clientId.current) : await writeLiveProgress(s, clientId.current)
    if (!ok && syncedFp.current === fp) syncedFp.current = null // retry on the next change
  }

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    const handleRecord = (rec: LiveRecord, force = false) => {
      if (!force && rec.rev <= lastRev.current) return
      lastRev.current = Math.max(lastRev.current, rec.rev)
      if (rec.updatedBy === clientId.current) return
      // Don't clobber a local edit that hasn't been written yet; it will be
      // published momentarily and supersede this snapshot.
      if (timer.current !== undefined) return
      syncedFp.current = fingerprint(rec.state)
      onRemoteRef.current(rec)
    }

    const resync = async () => {
      const rec = await fetchLiveRecord()
      if (cancelled || !rec) return
      handleRecord(rec)
    }

    void (async () => {
      const userId = await currentUserId()
      if (cancelled || !userId) return

      // Initial row. The phone adopts it; the screen only learns its rev, so a
      // leftover finish_requested/progress from an old workout can't leak in.
      const rec = await fetchLiveRecord()
      if (cancelled) return
      if (rec) {
        if (mode === 'remote') handleRecord(rec, true)
        else lastRev.current = rec.rev
      }
      setLoaded(true)

      unsubscribe = subscribeLiveWorkout(userId, {
        onRecord: (r) => handleRecord(r),
        onResync: () => void resync(),
        onConnection: setConnection,
      })
      setReady(true)
    })()

    return () => {
      cancelled = true
      unsubscribe?.()
      window.clearTimeout(timer.current)
      timer.current = undefined
      syncedFp.current = null
      lastRev.current = 0
      setReady(false)
      setLoaded(false)
      setConnection('connecting')
      if (mode === 'screen') void endLiveWorkout(clientId.current)
    }
  }, [enabled, mode])

  // Publish local changes (debounced). Remote-applied state matches syncedFp and is skipped.
  useEffect(() => {
    if (!enabled || !ready || !state) return
    if (fingerprint(state) === syncedFp.current) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush.current(), DEBOUNCE_MS)
  }, [state, enabled, ready])

  // Phones freeze the websocket in the background: refetch when we come back.
  useEffect(() => {
    if (!enabled || !ready) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void fetchLiveRecord().then((rec) => {
        if (rec && rec.rev > lastRev.current) {
          lastRev.current = rec.rev
          if (rec.updatedBy !== clientId.current && timer.current === undefined) {
            syncedFp.current = fingerprint(rec.state)
            onRemoteRef.current(rec)
          }
        }
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, ready])

  return { connection, loaded }
}
