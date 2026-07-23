/**
 * Compact collapsed history — past turns no longer render as full chat
 * bubbles; only what Rick said survives, as a small pill in a vertical trail
 * with a connecting line between them (directly modeled on the reference:
 * short pill bubbles stacked top to bottom, joined by a thin elbow). HEYRA's
 * own past replies aren't repeated here — the screen only ever shows her
 * CURRENT reply, large and centered — this is just enough breadcrumb to see
 * where the conversation has been.
 */
export default function HistoryTrail({ messages }: { messages: { id: string; text: string }[] }) {
  if (!messages.length) return null
  return (
    <div className="flex flex-col items-start gap-1.5 py-1">
      {messages.map((m, i) => (
        <div key={m.id} className="flex items-center gap-2">
          {i > 0 && <span className="w-3 h-3 border-l border-b border-line rounded-bl-md -mt-3 shrink-0" aria-hidden />}
          <span className="rounded-2xl bg-sunken px-3 py-1.5 text-xs text-ink-soft truncate max-w-[220px]">{m.text}</span>
        </div>
      ))}
    </div>
  )
}
