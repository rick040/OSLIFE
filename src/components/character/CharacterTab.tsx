import { useStore } from '../../store'
import { today } from '../../domains'
import { SectionTitle } from '../ui'
import {
  computeDomainAttributes,
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

  const attributes = computeDomainAttributes(goals)
  const overallProgressPct = overallProgress(attributes)
  const deltas = computeGapDeltas(goals)
  const branches = computeSkillTree(goals, milestones)
  const path = computeMilestonePath(goals, milestones)
  const quests = computeQuestLog(goals, milestones, today())
  const stats = computeCharacterStats(goals, milestones, habits)

  return (
    <div className="space-y-5">
      <CharacterHeader stats={stats} overallProgressPct={overallProgressPct} />
      <GapVisualization overallProgressPct={overallProgressPct} deltas={deltas} />

      <div>
        <SectionTitle hint="Elke balk is een echt doel uit North Star — vulling is waar je staat, het streepje is het target.">
          Attributen
        </SectionTitle>
        <AttributeBars attributes={attributes} />
      </div>

      <div>
        <SectionTitle hint="Elke tak is een levensdomein, elke node een doel, elke sub-node een mijlpaal.">
          Skill tree
        </SectionTitle>
        <SkillTree branches={branches} />
      </div>

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
