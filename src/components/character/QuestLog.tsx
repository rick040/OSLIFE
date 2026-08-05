import { Swords, Flame } from 'lucide-react'
import { DomainChip, Empty } from '../ui'
import { fmtDate } from '../../domains'
import type { QuestItem } from '../../character'

/**
 * The short-term half of the loop: the next actionable milestone per active
 * goal (computeQuestLog), soonest-due first, with an XP reward that scales
 * with urgency — closing a nearly-overdue quest is worth more than one due
 * in six months.
 */
export function QuestLog({ quests }: { quests: QuestItem[] }) {
  if (quests.length === 0) {
    return (
      <div className="card p-4">
        <Empty>Geen actieve quests — zet een mijlpaal in North Star om er een te openen.</Empty>
      </div>
    )
  }

  return (
    <div className="card p-4 space-y-2.5">
      {quests.map((q) => (
        <div key={q.id} className="flex items-center gap-3 rounded-xl bg-sunken px-3 py-2.5">
          <Swords className="h-4 w-4 text-ink-soft shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-soft truncate">{q.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <DomainChip domain={q.domain} small />
              <span className="chip bg-line text-faint text-[10px] px-1.5 py-0">{q.difficulty}</span>
              {q.goalTitle && <span className="text-[11px] text-faint truncate">{q.goalTitle}</span>}
            </div>
            {q.requiresTitle && (
              <p className="text-[10px] text-faint mt-0.5 truncate">Vereist: {q.requiresTitle}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="chip bg-prjct/15 text-prjct-deep text-[10px] px-1.5 py-0">+{q.xpReward} XP</span>
            {q.dueDate && (
              <span className={`text-[11px] inline-flex items-center gap-1 ${q.overdue ? 'text-cross font-medium' : 'text-faint'}`}>
                {q.overdue && <Flame className="h-3 w-3" aria-hidden="true" />}
                {fmtDate(q.dueDate)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
