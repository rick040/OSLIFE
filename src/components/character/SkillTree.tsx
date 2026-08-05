import { CheckCircle2, Zap, Lock, Circle, Check } from 'lucide-react'
import { domainMeta, DOMAIN_HEX, fmtDate } from '../../domains'
import { DomainSkillIcon } from './DomainSkillIcon'
import type { SkillBranch, SkillNode, NodeStatus } from '../../character'

/**
 * Status is never color-only: each status gets its own icon and border
 * treatment (solid fill / dashed pulsing ring / dashed faded outline) so the
 * tree still reads correctly for colorblind viewers or in a screenshot.
 */
function nodeVisuals(status: NodeStatus, hex: string) {
  if (status === 'mastered')
    return {
      Icon: CheckCircle2,
      wrapCls: 'border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]',
      style: { borderColor: hex, backgroundColor: `${hex}22` },
      iconStyle: { color: hex },
      label: 'behaald',
    }
  if (status === 'in_progress')
    return {
      Icon: Zap,
      wrapCls: 'border-2 border-dashed animate-pulse',
      style: { borderColor: hex },
      iconStyle: { color: hex },
      label: 'bezig',
    }
  return {
    Icon: Lock,
    wrapCls: 'border border-dashed border-line opacity-60',
    style: {},
    iconStyle: {},
    label: 'op slot',
  }
}

function GoalNode({ node, hex }: { node: SkillNode; hex: string }) {
  const v = nodeVisuals(node.status, hex)
  return (
    <div>
      <button
        type="button"
        className={`w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-hi ${v.wrapCls}`}
        style={v.style}
        aria-label={`${node.label} — ${v.label}${node.status === 'in_progress' ? `, ${Math.round(node.progress * 100)}% voltooid` : ''}`}
        title={node.label}
      >
        <v.Icon className="h-4 w-4 shrink-0" style={v.iconStyle} aria-hidden="true" />
        <span className="text-xs text-ink-soft truncate">{node.label}</span>
      </button>
      {node.children.length > 0 && (
        <ul className="ml-3 mt-1 mb-1 pl-3 border-l border-dashed border-line space-y-1">
          {node.children.map((child) => (
            <MilestoneNode key={child.id} node={child} hex={hex} />
          ))}
        </ul>
      )}
    </div>
  )
}

function MilestoneNode({ node, hex }: { node: SkillNode; hex: string }) {
  const Icon = node.status === 'mastered' ? Check : node.status === 'in_progress' ? Circle : Lock
  const cls =
    node.status === 'mastered'
      ? 'text-ink-soft'
      : node.status === 'in_progress'
        ? 'text-ink-soft font-medium'
        : 'text-faint opacity-60'
  return (
    <li>
      <button
        type="button"
        className="w-full flex items-center gap-1.5 text-left rounded-lg px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-hi"
        aria-label={`${node.label} — ${node.status === 'mastered' ? 'voltooid' : node.status === 'in_progress' ? 'huidige mijlpaal' : 'nog op slot'}${node.dueDate ? `, ${fmtDate(node.dueDate)}` : ''}`}
        title={node.label}
      >
        <Icon
          className={`h-3 w-3 shrink-0 ${node.status === 'in_progress' ? 'animate-pulse' : ''}`}
          style={node.status !== 'locked' ? { color: hex } : undefined}
          aria-hidden="true"
        />
        <span className={`text-[11px] truncate ${cls}`}>{node.label}</span>
      </button>
    </li>
  )
}

function BranchColumn({ branch }: { branch: SkillBranch }) {
  const meta = domainMeta(branch.domain)
  const hex = DOMAIN_HEX[branch.domain]
  const { xpIntoLevel, xpForNextLevel, atMaxLevel } = branch.level
  const xpPct = atMaxLevel ? 1 : xpForNextLevel > 0 ? xpIntoLevel / xpForNextLevel : 0

  return (
    <div className="w-56 shrink-0 space-y-2.5">
      <div className="sticky top-0 bg-surface pb-2 z-10 space-y-1.5">
        <div className="flex items-center gap-2.5">
          <DomainSkillIcon level={branch.level} size={36} />
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-semibold uppercase truncate ${meta.color}`}>{meta.label}</p>
            <p className="text-[10px] font-mono tabular-nums text-faint">
              {atMaxLevel ? 'max level' : `${xpIntoLevel}/${xpForNextLevel} xp`}
            </p>
          </div>
        </div>
        <div className="h-1 rounded-full bg-sunken overflow-hidden" role="progressbar" aria-valuenow={Math.round(xpPct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${meta.label} level ${branch.level.level}, voortgang naar volgend level`}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${xpPct * 100}%`, backgroundColor: hex }} />
        </div>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {branch.nodes.map((node) => (
          <GoalNode key={node.id} node={node} hex={hex} />
        ))}
      </div>
    </div>
  )
}

/**
 * One scrollable column per life domain, one node per goal, milestones
 * nested underneath. Adding a domain adds a column; adding a goal or
 * milestone adds a node — the layout never needs redesigning.
 */
export function SkillTree({ branches }: { branches: SkillBranch[] }) {
  return (
    <div className="card p-4">
      <div className="flex gap-5 overflow-x-auto pb-1">
        {branches.map((branch) => (
          <BranchColumn key={branch.domain} branch={branch} />
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-line flex items-center gap-4 flex-wrap text-[10px] text-faint">
        <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> behaald</span>
        <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3" /> bezig</span>
        <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> op slot</span>
      </div>
    </div>
  )
}
