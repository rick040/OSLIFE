import { useState } from 'react'
import { useStore } from '../store'
import { TODAY, fmtDate } from '../domains'
import { DomainChip, SectionTitle, Empty } from '../components/ui'
import { Mail, MailOpen, Star, CheckCheck } from 'lucide-react'

function when(iso: string) {
  const date = iso.slice(0, 10)
  if (date === TODAY) return iso.slice(11, 16)
  return fmtDate(date)
}

export default function Inbox() {
  const { emails, markEmailRead, markAllEmailsRead } = useStore()
  const [tab, setTab] = useState<'important' | 'all'>('important')

  const list = (tab === 'important' ? emails.filter((e) => e.important) : emails).sort((a, b) =>
    a.receivedAt < b.receivedAt ? 1 : -1,
  )
  const unread = emails.filter((e) => e.unread).length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-personal" /> Inbox
          </h1>
          <p className="text-sm text-muted mt-1">De mails die er nu toe doen, uit je Gmail. {unread} ongelezen.</p>
        </div>
        {unread > 0 && (
          <button className="btn-ghost" onClick={markAllEmailsRead}>
            <CheckCheck className="h-4 w-4" /> Alles gelezen
          </button>
        )}
      </div>

      <div className="flex gap-1">
        {(['important', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`chip ${tab === t ? 'bg-forest text-white' : 'bg-surface border border-line text-muted hover:text-ink'}`}
          >
            {t === 'important' ? 'Belangrijk' : 'Alles'}
          </button>
        ))}
      </div>

      {list.length ? (
        <div className="space-y-2">
          {list.map((e) => (
            <button
              key={e.id}
              onClick={() => markEmailRead(e.id)}
              className={`card w-full text-left p-4 flex items-start gap-3 transition-colors hover:border-line ${
                e.unread ? 'border-personal/30' : ''
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {e.unread ? <Mail className="h-4 w-4 text-personal" /> : <MailOpen className="h-4 w-4 text-faint" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm truncate ${e.unread ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
                    {e.from}
                  </span>
                  {e.important && <Star className="h-3 w-3 text-personal fill-personal shrink-0" />}
                  <DomainChip domain={e.domain} small />
                  <span className="text-[11px] text-faint ml-auto shrink-0">{when(e.receivedAt)}</span>
                </div>
                <div className={`text-sm mt-0.5 truncate ${e.unread ? 'text-ink' : 'text-muted'}`}>
                  {e.subject}
                </div>
                <div className="text-[12px] text-faint mt-0.5 line-clamp-2">{e.snippet}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Empty>Geen mails in dit filter.</Empty>
      )}

      <SectionTitle hint="In een echte build sync deze view met de Gmail API en kan Capture er threads van maken.">
        Mock-inbox
      </SectionTitle>
    </div>
  )
}
