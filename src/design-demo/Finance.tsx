import { useState } from 'react'
import { Card, HeroStat, DuoCompare, MetricCard, GoalRow, Sparkline, SegmentedSwitcher } from './components'

const SCOPES = ['Vandaag', 'Persoonlijk', 'ParkingYou', 'PRJCT'] as const

/** Screen 6/12 — Finance & budgeting: mirrors Ref B closely. */
export default function Finance() {
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('Vandaag')

  return (
    <div className="flex flex-col gap-6">
      <SegmentedSwitcher options={SCOPES} active={scope} onChange={setScope} />

      <HeroStat label="Saldo" value="€1302" />

      <DuoCompare leftLabel="Inkomsten" leftValue="€3291" rightLabel="Uitgaven" rightValue="€2474" />

      <div>
        <p className="v3-micro-label mb-2.5 px-1">Deze maand</p>
        <div className="v3-metric-grid">
          <MetricCard label="ParkingYou" value="€2114" />
          <MetricCard label="PRJCT Agency" value="€1149" delta={15} />
          <MetricCard label="Fiverr" value="€163" delta={-4} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="v3-micro-label mb-3">Inkomsten</p>
          <Sparkline points={[2100, 2400, 2200, 2800, 3000, 2900, 3291]} />
        </Card>
        <Card>
          <p className="v3-micro-label mb-3">Uitgaven</p>
          <Sparkline points={[1800, 2000, 2600, 2300, 2100, 2500, 2474]} color="hsl(var(--v3-danger-text))" />
        </Card>
      </div>

      <div>
        <p className="v3-heading mb-3">Doelen</p>
        <div className="flex flex-col gap-2">
          <GoalRow label="Vakantie" current={3291} target={3291} />
          <GoalRow label="Buffer" current={1200} target={3000} />
          <GoalRow label="Nieuwe auto" current={450} target={8000} />
        </div>
      </div>
    </div>
  )
}
