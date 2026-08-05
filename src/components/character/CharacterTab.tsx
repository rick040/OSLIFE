import { useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { today } from '../../domains'
import { SectionTitle } from '../ui'
import {
  computeDomainAttributes,
  computeDomainLevels,
  computeGapDeltas,
  overallProgress,
  computeSkillTree,
  computeMilestonePath,
  computeQuestLog,
  computeCharacterStats,
} from '../../character'
import { CharacterHeader } from './CharacterHeader'
import { GapVisualization } from './GapVisualization'
import { AttributeBars } from './AttributeBars'
import { SkillTree } from './SkillTree'
import { QuestLog } from './QuestLog'
import { MilestonePath } from './MilestonePath'
import { ProposedQuests } from './ProposedQuests'
import { LevelUpToasts } from './LevelUpToasts'

/**
 * The gamified character view: every number on this tab is read straight off
 * `goals`, `milestones` and `habits` — the same rows North Star and the
 * habit tracker already persist to Supabase — through the pure projections
 * in src/character.ts. There is no separate gamification schema: delete this
 * tab and nothing durable is lost, because nothing here is the source of truth.
 */
export default function CharacterTab() {
  const goals = useStore((s) => s.goals)
  const milestones = useStore((s) => s.milestones)
  const habits = useStore((s) => s.habits)
  const goalProposals = useStore((s) => s.goalProposals)
  const proposingGoals = useStore((s) => s.proposingGoals)
  const lastGoalProposalError = useStore((s) => s.lastGoalProposalError)
  const proposeGoals = useStore((s) => s.proposeGoals)
  const acceptGoalProposal = useStore((s) => s.acceptGoalProposal)
  const dismissGoalProposal = useStore((s) => s.dismissGoalProposal)

  const attributes = computeDomainAttributes(goals)
  const levels = computeDomainLevels(goals, milestones)
  const overallProgressPct = overallProgress(attributes)
  const deltas = computeGapDeltas(goals)
  const branches = computeSkillTree(goals, milestones)
  const path = computeMilestonePath(goals, milestones)
  const quests = computeQuestLog(goals, milestones, today())
  const stats = computeCharacterStats(goals, milestones, habits)

  // Auto-suggest: as soon as the tray is empty (nothing pending to accept or
  // dismiss), quietly ask HEYRA for new quest offers — same call North Star's
  // "voorstel doelen" button makes, just fired without waiting for a click.
  // Emptying the tray (accept/dismiss everything) is what re-arms this.
  const autoProposedRef = useRef(false)
  useEffect(() => {
    if (autoProposedRef.current) return
    if (goalProposals.length > 0 || proposingGoals) return
    autoProposedRef.current = true
    void proposeGoals()
  }, [goalProposals.length, proposingGoals, proposeGoals])

  return (
    <div className="space-y-5">
      <LevelUpToasts totalLevel={stats.totalLevel} levels={levels} />
      <CharacterHeader stats={stats} overallProgressPct={overallProgressPct} />
      <GapVisualization overallProgressPct={overallProgressPct} deltas={deltas} />

      <div>
        <SectionTitle hint="Elke balk is een echt doel uit North Star — vulling is waar je staat, het streepje is het target.">
          Attributen
        </SectionTitle>
        <AttributeBars attributes={attributes} levels={levels} />
      </div>

      <div>
        <SectionTitle hint="Elke tak is een levensdomein, elke node een doel, elke sub-node een mijlpaal.">
          Skill tree
        </SectionTitle>
        <SkillTree branches={branches} />
      </div>

      {(proposingGoals || lastGoalProposalError || goalProposals.length > 0) && (
        <div>
          <SectionTitle hint="HEYRA stelt deze zelf voor op basis van wat er al over je bekend is — accepteer om er een echt doel + skill-node van te maken.">
            Nieuwe quests
          </SectionTitle>
          <ProposedQuests
            proposals={goalProposals}
            loading={proposingGoals}
            error={lastGoalProposalError}
            onAccept={acceptGoalProposal}
            onDismiss={dismissGoalProposal}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <SectionTitle hint="De eerstvolgende mijlpaal per lopend doel, met XP naar hoe dringend hij is.">Quests</SectionTitle>
          <QuestLog quests={quests} />
        </div>
        <div>
          <SectionTitle hint="Alle mijlpalen op een tijdlijn — achter je, nu, of nog te gaan.">Mijlpalenpad</SectionTitle>
          <MilestonePath steps={path} />
        </div>
      </div>
    </div>
  )
}
