import { useState } from 'react'
import { Layers, Grid3x3, Home, Wallet } from 'lucide-react'
import { SegmentedSwitcher, IconRail } from './components'
import Framework from './Framework'
import Library from './Library'
import Homepage from './Homepage'
import Finance from './Finance'
import './redesign.css'

const SECTIONS = ['Framework', 'Library', 'Homepage', 'Finance'] as const
type Section = (typeof SECTIONS)[number]

const RAIL_ICONS: Record<Section, React.ReactNode> = {
  Framework: <Layers className="h-[18px] w-[18px]" />,
  Library: <Grid3x3 className="h-[18px] w-[18px]" />,
  Homepage: <Home className="h-[18px] w-[18px]" />,
  Finance: <Wallet className="h-[18px] w-[18px]" />,
}

/**
 * RICK-OS v3 redesign preview — standalone, at /design-demo, not wired into
 * the app. Phase 1 (tokens/framework) + Phase 2 (full component library) +
 * 2 of the proposed 12 screens (Homepage, Finance) so the direction can be
 * reviewed before the remaining 10 screens get built from this same library.
 */
export default function RedesignDemo() {
  const [section, setSection] = useState<Section>('Framework')

  return (
    <div className="v3-root">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex gap-6">
        <div className="hidden md:block">
          <IconRail
            active={section}
            icons={SECTIONS.map((s) => ({ key: s, icon: RAIL_ICONS[s] }))}
          />
        </div>

        <div className="flex-1 min-w-0 max-w-xl mx-auto flex flex-col gap-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="v3-heading">RICK-OS — design preview</h1>
            <SegmentedSwitcher options={SECTIONS} active={section} onChange={setSection} />
          </div>

          {section === 'Framework' && <Framework />}
          {section === 'Library' && <Library />}
          {section === 'Homepage' && <Homepage />}
          {section === 'Finance' && <Finance />}
        </div>
      </div>
    </div>
  )
}
