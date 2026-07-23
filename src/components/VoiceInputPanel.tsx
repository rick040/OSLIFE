import { useEffect } from 'react'
import { Overlay } from './ui'
import { useVoiceInput } from '../heyra/useVoiceInput'
import { Mic, Square, Trash2, Send, RotateCcw } from 'lucide-react'

/**
 * The dedicated voice-input flow: listening (live transcript, mic stays open
 * across pauses) → reviewing (the transcript sits in an editable textarea) →
 * an explicit tap on "Versturen" hands it to onSend. Nothing here ever sends
 * on its own — silence, a pause, or the mic auto-stopping all land in the
 * same editable review step, never a direct send.
 */
export default function VoiceInputPanel({
  onSend,
  onClose,
}: {
  onSend: (text: string) => void
  onClose: () => void
}) {
  const voice = useVoiceInput()

  // Open with the mic already listening — the button that opened this panel
  // already signaled "I want to speak now".
  useEffect(() => {
    voice.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClose() {
    voice.reset()
    onClose()
  }

  function handleSend() {
    const text = voice.transcript.trim()
    if (!text) return
    onSend(text)
    voice.reset()
    onClose()
  }

  return (
    <Overlay
      tone="scrim-blur"
      onClose={handleClose}
      className="flex items-end sm:items-center justify-center p-4 animate-fade-up"
      panelClassName="card shadow-card-lg max-w-md w-full p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunken">
          <Mic className="h-4 w-4 text-ink-soft" />
        </span>
        <div>
          <h2 className="text-base font-medium text-ink">Spraakinvoer</h2>
          <p className="text-xs text-muted">
            {voice.state === 'listening' ? 'Luistert — tik op stop als je klaar bent' : 'Controleer je tekst voordat je hem verstuurt'}
          </p>
        </div>
      </div>

      {voice.state === 'listening' && (
        <div className="space-y-4">
          <div className="min-h-[4.5rem] rounded-xl bg-sunken px-4 py-3 text-sm text-ink whitespace-pre-line">
            {voice.transcript || <span className="text-faint italic">Zeg iets…</span>}
          </div>
          <div className="flex items-center justify-center">
            <button
              onClick={voice.stop}
              className="btn bg-cross text-white animate-pulse-ring rounded-full h-14 w-14 p-0 flex items-center justify-center"
              aria-label="Stop opname"
            >
              <Square className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {voice.state === 'reviewing' && (
        <div className="space-y-3">
          <textarea
            value={voice.transcript}
            onChange={(e) => voice.setTranscript(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Er is niets opgenomen — typ het handmatig of neem opnieuw op."
            className="w-full rounded-xl bg-surface border border-line px-4 py-3 text-sm outline-none focus:border-prjct/60 resize-none"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={handleSend} disabled={!voice.transcript.trim()} className="btn-primary">
              <Send className="h-4 w-4" /> Versturen
            </button>
            <button onClick={voice.start} className="btn-ghost">
              <RotateCcw className="h-4 w-4" /> Opnieuw opnemen
            </button>
            <button onClick={handleClose} className="btn-ghost">
              <Trash2 className="h-4 w-4" /> Verwijderen
            </button>
          </div>
        </div>
      )}
    </Overlay>
  )
}
