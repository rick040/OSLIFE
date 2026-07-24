import { Check } from 'lucide-react'

/**
 * Deliberately tiny Markdown renderer — no new dependency. Shared by every
 * surface that shows HEYRA-authored or template-generated prose (nudge/
 * priority cards, chat replies, coach advice, braindump/idea notes) so a
 * generated `**bold**`, `*italic*`, `- bullet` or `- [ ] checkbox` line
 * always renders styled instead of showing raw markdown characters.
 *
 * Handles the shapes generators actually emit: #/##/### headings, - bullets,
 * - [ ]/- [x] checkboxes, [links](url), **bold**, *italic*, and paragraphs.
 * Everything else renders as plain text.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: JSX.Element[] = []
  let list: { text: string; checked: boolean | null }[] = []
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="space-y-1 text-sm text-ink-soft">
          {list.map((li, i) =>
            li.checked === null ? (
              <li key={i} className="flex gap-1.5 pl-0.5">
                <span className="select-none text-faint">•</span>
                <span>{inline(li.text)}</span>
              </li>
            ) : (
              <li key={i} className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    li.checked ? 'border-buurtkaart bg-buurtkaart/20' : 'border-line'
                  }`}
                >
                  {li.checked && <Check className="h-3 w-3 text-buurtkaart-deep" />}
                </span>
                <span className={li.checked ? 'text-faint line-through' : ''}>{inline(li.text)}</span>
              </li>
            ),
          )}
        </ul>,
      )
      list = []
    }
  }
  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const checkbox = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line)
    if (/^###\s+/.test(line)) { flush(); out.push(<h4 key={i} className="text-sm font-semibold text-ink mt-2">{inline(line.replace(/^###\s+/, ''))}</h4>) }
    else if (/^##\s+/.test(line)) { flush(); out.push(<h3 key={i} className="text-base font-semibold text-ink mt-2">{inline(line.replace(/^##\s+/, ''))}</h3>) }
    else if (/^#\s+/.test(line)) { flush(); out.push(<h2 key={i} className="text-lg font-semibold text-ink">{inline(line.replace(/^#\s+/, ''))}</h2>) }
    else if (checkbox) { list.push({ text: checkbox[2], checked: checkbox[1].toLowerCase() === 'x' }) }
    else if (/^[-*]\s+/.test(line)) { list.push({ text: line.replace(/^[-*]\s+/, ''), checked: null }) }
    else if (line.trim() === '') { flush() }
    else { flush(); out.push(<p key={i} className="text-sm text-ink-soft leading-relaxed">{inline(line)}</p>) }
  })
  flush()
  return <div className="space-y-1.5">{out}</div>
}

/**
 * Inline-only variant: bold/italic/link emphasis with no block structure
 * (no headings, lists or paragraph wrapping) — safe to drop inside an
 * existing `<p>`/`<span>`, including one truncated with `line-clamp`.
 */
export function MarkdownInline({ text }: { text: string }) {
  return <>{inline(text)}</>
}

/** Inline formatting: [text](url) links, **bold**, and *italic*. */
function inline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2]) parts.push(<a key={k++} href={m[2]} target="_blank" rel="noreferrer" className="text-buurtkaart underline">{m[1]}</a>)
    else if (m[3]) parts.push(<strong key={k++} className="font-semibold text-ink">{m[3]}</strong>)
    else if (m[4]) parts.push(<em key={k++} className="italic">{m[4]}</em>)
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
