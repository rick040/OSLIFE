// ── HEYRA · voice input hook ─────────────────────────────────────────────────
// Wraps the native Web Speech API (SpeechRecognition/webkitSpeechRecognition),
// extracted out of Heyra.tsx so VoiceInputPanel owns none of the recognition
// plumbing directly. `continuous: true` (the old inline version used `false`,
// which cut recognition off after the first pause) so a longer thought with a
// mid-sentence pause doesn't get cut short — the user explicitly taps Stop,
// never an auto-stop-and-send on silence. That's also the "one-way voice,
// never sent automatically" guarantee VoiceInputPanel depends on: this hook
// only ever fills `transcript`, nothing here calls send().
//
// Some browsers end recognition on their own (long silence, network hiccup) —
// onend()/onerror() land in 'reviewing' either way so whatever was captured
// isn't lost, and the user still gets the editable-review step before anything
// is sent.

import { useEffect, useRef, useState } from 'react'

type SpeechRec = {
  start: () => void
  stop: () => void
  onresult: ((e: any) => void) | null
  onend: (() => void) | null
  onerror: ((e: any) => void) | null
  lang: string
  interimResults: boolean
  continuous: boolean
}

export type VoiceState = 'idle' | 'listening' | 'reviewing'

export interface UseVoiceInput {
  state: VoiceState
  transcript: string
  setTranscript: (t: string) => void
  start: () => void
  stop: () => void
  reset: () => void
  supported: boolean
}

export function useVoiceInput(lang = 'nl-NL'): UseVoiceInput {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const recRef = useRef<SpeechRec | null>(null)

  const supported =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  function start() {
    if (!supported) return
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const rec: SpeechRec = new Ctor()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>)
        .map((r: any) => r[0].transcript)
        .join('')
      setTranscript(text)
    }
    rec.onend = () => setState((s) => (s === 'listening' ? 'reviewing' : s))
    rec.onerror = () => setState((s) => (s === 'listening' ? 'reviewing' : s))
    recRef.current = rec
    setTranscript('')
    setState('listening')
    rec.start()
  }

  function stop() {
    recRef.current?.stop()
    setState('reviewing')
  }

  function reset() {
    recRef.current?.stop()
    recRef.current = null
    setTranscript('')
    setState('idle')
  }

  // Stop any in-flight recognition if the panel unmounts mid-listen (e.g. the
  // user navigates away) — a dangling SpeechRecognition instance keeps the
  // mic indicator lit in some browsers otherwise.
  useEffect(() => () => { recRef.current?.stop() }, [])

  return { state, transcript, setTranscript, start, stop, reset, supported }
}
