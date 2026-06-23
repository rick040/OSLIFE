import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { SectionTitle, Empty } from '../components/ui'
import { buildBrain, type CatId, type BNode, type GSuggestion } from '../graph'
import { Network, Zap, Lightbulb, Eye, X, Plus, Minus, Maximize2, Layers } from 'lucide-react'

const CAT: Record<CatId, string> = {
  work: '#3B4A22', money: '#586B2E', health: '#6F8A55', habits: '#8AA06A', goals: '#A3B585', mind: '#C2CBA6',
}
const ACCENT = '#9DBB3C'
const ALERT = '#C58392'
const CROSS = '#6E8CA8'
const LINE = '#CDD0C2'
const LINE_HI = '#7E9B57'
const HALO = '#F2F3EC'

const TONE: Record<string, { cls: string; icon: typeof Zap; label: string }> = {
  action: { cls: 'border-cross/40 bg-cross/5', icon: Zap, label: 'actie' },
  insight: { cls: 'border-parkingyou/40 bg-parkingyou/5', icon: Lightbulb, label: 'inzicht' },
  watch: { cls: 'border-personal/40 bg-personal/5', icon: Eye, label: 'let op' },
}
const dotR = (n: BNode) => (n.kind === 'category' ? 7 : n.kind === 'entity' ? 5 : 3.5)

export default function Mindmap() {
  const s = useStore()
  const brain = useMemo(
    () => buildBrain(s.items, s.threads, s.payments, s.projects, s.emails, s.patterns, s.transactions, s.dayLogs, s.habits, s.goals, s.milestones, s.healthDays),
    [s.items, s.threads, s.payments, s.projects, s.emails, s.patterns, s.transactions, s.dayLogs, s.habits, s.goals, s.milestones, s.healthDays],
  )
  const byId = useMemo(() => Object.fromEntries(brain.nodes.map((n) => [n.id, n])), [brain])
  const childrenOf = useMemo(() => {
    const m: Record<string, BNode[]> = {}
    brain.nodes.forEach((n) => { if (n.parent) (m[n.parent] ||= []).push(n) })
    return m
  }, [brain])

  const home = useMemo(() => {
    const p: Record<string, { x: number; y: number }> = {}
    const cats = brain.nodes.filter((n) => n.kind === 'category')
    cats.forEach((c, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / cats.length
      p[c.id] = { x: 300 * Math.cos(a), y: 300 * Math.sin(a) }
    })
    const place = (hubId: string, depth: number) => {
      const hub = p[hubId]
      const kids = childrenOf[hubId] || []
      if (!kids.length) return
      const base = Math.atan2(hub.y, hub.x) || -Math.PI / 2
      const radius = depth === 1 ? 135 : 75
      const spread = depth === 1 ? Math.PI * 0.95 : Math.PI * 1.4
      kids.forEach((k, i) => {
        const a = kids.length === 1 ? base : base - spread / 2 + (spread * i) / (kids.length - 1)
        p[k.id] = { x: hub.x + radius * Math.cos(a), y: hub.y + radius * Math.sin(a) }
        place(k.id, depth + 1)
      })
    }
    cats.forEach((c) => place(c.id, 1))
    return p
  }, [brain, childrenOf])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<string[] | null>(null)
  const [size, setSize] = useState({ w: 800, h: 560 })
  const [, setFrame] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const sim = useRef(new Map<string, { x: number; y: number; vx: number; vy: number }>())
  const cam = useRef({ x: 400, y: 280, k: 1 })
  const camTarget = useRef<{ x: number; y: number; k: number } | null>(null)
  const alpha = useRef(0)
  const followUntil = useRef(0)
  const running = useRef(false)
  const raf = useRef(0)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ moved: false, dist: 0 })

  // ── visible set (progressive disclosure) ────────────────────────────────────
  const visible = useMemo(() => {
    const vis = new Set<string>()
    const ok = (n: BNode): boolean => {
      let p = n.parent
      while (p) { if (!expanded.has(p)) return false; p = byId[p]?.parent ?? null }
      return true
    }
    brain.nodes.forEach((n) => { if (n.kind === 'category' || ok(n)) vis.add(n.id) })
    return vis
  }, [brain, expanded, byId])
  const visNodes = useMemo(() => brain.nodes.filter((n) => visible.has(n.id)), [brain, visible])
  const visEdges = useMemo(() => brain.edges.filter((e) => visible.has(e.a) && visible.has(e.b)), [brain, visible])

  const ancestorsOf = (id: string) => { const o: string[] = []; let p = byId[id]?.parent ?? null; while (p) { o.push(p); p = byId[p]?.parent ?? null } return o }

  const highlight = useMemo(() => {
    if (selected && byId[selected]?.kind !== 'category') {
      const set = new Set<string>([selected])
      brain.edges.forEach((e) => { if (e.a === selected) set.add(e.b); if (e.b === selected) set.add(e.a) })
      return set
    }
    if (focus) return new Set(focus)
    return null
  }, [selected, focus, brain, byId])
  const dimmed = !!highlight

  // refs the loop reads
  const visRef = useRef(visNodes); visRef.current = visNodes
  const edgeRef = useRef(visEdges); edgeRef.current = visEdges
  const focusRef = useRef<string[] | null>(null)
  const homeRef = useRef(home); homeRef.current = home
  const byIdRef = useRef(byId); byIdRef.current = byId
  const sizeRef = useRef(size); sizeRef.current = size

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(300, r.width), h: Math.max(360, r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const seed = (id: string) => {
    let v = sim.current.get(id)
    if (!v) { const h = homeRef.current[id] || { x: 0, y: 0 }; v = { x: h.x, y: h.y, vx: 0, vy: 0 }; sim.current.set(id, v) }
    return v
  }
  const bboxCam = (ids: string[]) => {
    const pts = ids.map((id) => seed(id))
    if (!pts.length) return null
    const { w, h } = sizeRef.current
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const pad = 90
    const minx = Math.min(...xs) - pad, maxx = Math.max(...xs) + pad
    const miny = Math.min(...ys) - pad, maxy = Math.max(...ys) + pad
    const k = Math.min(2.6, Math.max(0.45, Math.min(w / (maxx - minx), h / (maxy - miny))))
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2
    return { k, x: w / 2 - cx * k, y: h / 2 - cy * k }
  }

  const kick = () => { if (!running.current) { running.current = true; raf.current = requestAnimationFrame(step) } }
  const reheat = () => { alpha.current = 1; kick() }

  const step = () => {
    const nodes = visRef.current
    const edges = edgeRef.current
    const home2 = homeRef.current
    const byId2 = byIdRef.current
    nodes.forEach((n) => seed(n.id))

    if (alpha.current > 0.02) {
      const a = alpha.current
      nodes.forEach((n) => { if (n.kind === 'category') { const S = sim.current.get(n.id)!; const h = home2[n.id]; S.x = h.x; S.y = h.y; S.vx = 0; S.vy = 0 } })
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const A = sim.current.get(nodes[i].id)!, B = sim.current.get(nodes[j].id)!
          let dx = A.x - B.x, dy = A.y - B.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) { d2 = 1; dx = (i - j) || 1; dy = 0.5 }
          const d = Math.sqrt(d2)
          const f = (2600 / d2) * a
          const fx = (dx / d) * f, fy = (dy / d) * f
          if (nodes[i].kind !== 'category') { A.vx += fx; A.vy += fy }
          if (nodes[j].kind !== 'category') { B.vx -= fx; B.vy -= fy }
        }
      }
      edges.forEach((e) => {
        const A = sim.current.get(e.a), B = sim.current.get(e.b)
        if (!A || !B) return
        const dx = B.x - A.x, dy = B.y - A.y
        const d = Math.hypot(dx, dy) || 1
        const L = e.kind === 'cross' ? 240 : byId2[e.a]?.kind === 'category' || byId2[e.b]?.kind === 'category' ? 125 : 80
        const k2 = (e.kind === 'cross' ? 0.012 : 0.06) * a
        const f = (d - L) * k2
        const fx = (dx / d) * f, fy = (dy / d) * f
        if (byId2[e.a]?.kind !== 'category') { A.vx += fx; A.vy += fy }
        if (byId2[e.b]?.kind !== 'category') { B.vx -= fx; B.vy -= fy }
      })
      nodes.forEach((n) => { if (n.kind === 'category') return; const S = sim.current.get(n.id)!; S.vx *= 0.82; S.vy *= 0.82; S.x += S.vx; S.y += S.vy })
      alpha.current *= 0.96
    }

    if (focusRef.current && performance.now() < followUntil.current) {
      const t = bboxCam(focusRef.current)
      if (t) camTarget.current = t
    }
    if (camTarget.current) {
      const c = cam.current, t = camTarget.current
      c.x += (t.x - c.x) * 0.18; c.y += (t.y - c.y) * 0.18; c.k += (t.k - c.k) * 0.18
      if (Math.abs(t.x - c.x) < 0.4 && Math.abs(t.y - c.y) < 0.4 && Math.abs(t.k - c.k) < 0.002) { c.x = t.x; c.y = t.y; c.k = t.k; camTarget.current = null }
    }

    setFrame((f) => (f + 1) % 1000000)

    const idle = alpha.current <= 0.02 && !camTarget.current && pointers.current.size === 0
    if (idle) running.current = false
    else raf.current = requestAnimationFrame(step)
  }

  useEffect(() => { reheat() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [visNodes, visEdges, size, focus])
  // fit the whole map whenever the canvas resizes — but only while in overview,
  // so we never yank the camera away while the user is navigating.
  useEffect(() => {
    if (selected || expanded.size) return
    visNodes.forEach((n) => seed(n.id))
    const t = bboxCam(brain.categories.map((c) => `cat:${c.id}`))
    if (t) { cam.current = t; setFrame((f) => (f + 1) % 1000000) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const animateTo = (ids: string[]) => { focusRef.current = ids; followUntil.current = performance.now() + 750; reheat() }
  const reset = () => { const t = bboxCam(brain.categories.map((c) => `cat:${c.id}`)); if (t) camTarget.current = t; focusRef.current = null; kick() }

  const onNode = (n: BNode) => {
    setFocus(null)
    if (n.hub) {
      const willExpand = !expanded.has(n.id)
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(n.id)) { const drop = (id: string) => { next.delete(id); (childrenOf[id] || []).forEach((c) => drop(c.id)) }; drop(n.id) }
        else next.add(n.id)
        return next
      })
      setSelected(n.id)
      animateTo(willExpand ? [n.id, ...(childrenOf[n.id] || []).map((c) => c.id)] : n.parent ? [n.parent, ...(childrenOf[n.parent] || []).map((c) => c.id)] : [n.id])
    } else {
      const now = selected !== n.id
      setSelected(now ? n.id : null)
      if (now) { const nb = brain.edges.filter((e) => e.a === n.id || e.b === n.id).map((e) => (e.a === n.id ? e.b : e.a)); animateTo([n.id, ...nb]) }
      else reset()
    }
  }
  const showSuggestion = (sg: GSuggestion) => {
    setSelected(null)
    const exp = new Set(expanded)
    sg.nodeIds.forEach((id) => ancestorsOf(id).forEach((a) => exp.add(a)))
    setExpanded(exp)
    setFocus(sg.nodeIds)
    animateTo(sg.nodeIds.length ? sg.nodeIds : brain.categories.map((c) => `cat:${c.id}`))
  }

  // ── pan / pinch / wheel ─────────────────────────────────────────────────────
  const localXY = (e: { clientX: number; clientY: number }) => { const r = svgRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const zoomAround = (cx: number, cy: number, f: number) => {
    const c = cam.current
    const k = Math.min(4, Math.max(0.35, c.k * f))
    const wx = (cx - c.x) / c.k, wy = (cy - c.y) / c.k
    c.x = cx - wx * k; c.y = cy - wy * k; c.k = k
    camTarget.current = null; kick()
  }
  const onPointerDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); pointers.current.set(e.pointerId, localXY(e)); gesture.current = { moved: false, dist: 0 }; camTarget.current = null; kick() }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    const cur = localXY(e)
    pointers.current.set(e.pointerId, cur)
    const pts = [...pointers.current.values()]
    if (pts.length >= 2) {
      const [a, b] = pts
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (gesture.current.dist) zoomAround(mid.x, mid.y, dist / gesture.current.dist)
      gesture.current.dist = dist; gesture.current.moved = true
    } else {
      const dx = cur.x - prev.x, dy = cur.y - prev.y
      if (Math.abs(dx) + Math.abs(dy) > 2) gesture.current.moved = true
      cam.current.x += dx; cam.current.y += dy; kick()
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId); gesture.current.dist = 0
    if (!gesture.current.moved && pointers.current.size === 0 && e.target === svgRef.current) { setSelected(null); setFocus(null) }
  }
  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); const l = localXY(e); zoomAround(l.x, l.y, e.deltaY < 0 ? 1.12 : 1 / 1.12) }
  const zoomBtn = (f: number) => zoomAround(size.w / 2, size.h / 2, f)

  const selNode = selected ? byId[selected] : null
  const selConns = selected ? brain.edges.filter((e) => e.a === selected || e.b === selected).map((e) => byId[e.a === selected ? e.b : e.a]).filter(Boolean) : []

  // ── render coordinates (screen px) from current sim + camera ────────────────
  const k = cam.current.k, camx = cam.current.x, camy = cam.current.y
  const P = (id: string) => { const v = seed(id); return { x: v.x * k + camx, y: v.y * k + camy } }
  const showRecordLabels = k > 1.05 || !!highlight

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Network className="h-5 w-5 text-forest" /> Second brain</h1>
        <p className="text-sm text-muted mt-1">Tik een cluster: hij opent en de camera glijdt erheen. Pinch/scroll om te zoomen, sleep om te pannen. Blauwe gebogen lijnen zijn cross-relaties tussen domeinen.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div ref={wrapRef} className="lg:col-span-2 card p-0 overflow-hidden relative" style={{ touchAction: 'none' }}>
          <div className="absolute top-3 right-3 z-10 flex gap-1">
            <button className="btn-ghost !p-2 !rounded-xl" title="Inzoomen" onClick={() => zoomBtn(1.25)}><Plus className="h-4 w-4" /></button>
            <button className="btn-ghost !p-2 !rounded-xl" title="Uitzoomen" onClick={() => zoomBtn(1 / 1.25)}><Minus className="h-4 w-4" /></button>
            <button className="btn-ghost !p-2 !rounded-xl" title="Alles tonen" onClick={reset}><Maximize2 className="h-4 w-4" /></button>
            <button className="btn-ghost !p-2 !rounded-xl" title="Alles inklappen" onClick={() => { setExpanded(new Set()); setSelected(null); setFocus(null); reset() }}><Layers className="h-4 w-4" /></button>
          </div>

          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            className="w-full h-[clamp(440px,64vh,680px)] cursor-grab active:cursor-grabbing select-none touch-none"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* always-on subtle category web */}
            {brain.catLinks.map((l) => {
              const a = P(`cat:${l.a}`), b = P(`cat:${l.b}`)
              return <line key={`${l.a}-${l.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={CROSS} strokeWidth={Math.min(2.5, 1 + l.weight * 0.5)} strokeDasharray="2 7" opacity={0.4} />
            })}
            {/* edges */}
            {visEdges.map((e) => {
              const a = P(e.a), b = P(e.b)
              const lit = !dimmed || (highlight!.has(e.a) && highlight!.has(e.b))
              if (e.kind === 'cross') {
                const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.18, my = (a.y + b.y) / 2 + (a.x - b.x) * 0.18
                return <path key={e.id} d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`} fill="none" stroke={CROSS} strokeWidth={lit ? 2 : 1.2} strokeDasharray="5 5" opacity={lit ? 0.9 : 0.3} />
              }
              return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit ? LINE_HI : LINE} strokeWidth={lit ? 1.5 : 1} opacity={lit ? 0.85 : 0.4} />
            })}
            {/* nodes */}
            {visNodes.map((n) => {
              const sp = P(n.id)
              const color = CAT[n.cat]
              const r = dotR(n)
              const isSel = selected === n.id
              const lit = !dimmed || highlight!.has(n.id)
              const alert = n.flag === 'overdue' || n.flag === 'stressed'
              const collapsed = n.hub && n.kind !== 'category' && !expanded.has(n.id)
              const labelShow = n.kind === 'category' || n.kind === 'entity' || isSel || (highlight?.has(n.id) ?? false) || showRecordLabels
              const fs = n.kind === 'category' ? 16 : n.kind === 'entity' ? 14 : 12.5
              return (
                <g key={n.id} transform={`translate(${sp.x},${sp.y})`} opacity={dimmed && !lit ? 0.18 : 1} className="cursor-pointer" onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); onNode(n) }}>
                  {isSel && <circle r={r + 5} fill="none" stroke={ACCENT} strokeWidth={2.5} />}
                  {alert && !isSel && <circle r={r + 3} fill="none" stroke={ALERT} strokeWidth={2} />}
                  {collapsed && <circle r={r + 3.5} fill="none" stroke={color} strokeOpacity={0.4} strokeWidth={1.2} strokeDasharray="1.5 2.5" />}
                  <circle r={r} fill={n.kind === 'record' ? '#FFFFFF' : color} stroke={color} strokeWidth={n.kind === 'record' ? 2 : 0} />
                  {labelShow && (
                    <text y={-(r + 7)} textAnchor="middle" fontSize={fs} fontWeight={n.kind === 'category' ? 600 : 500} fill={n.kind === 'category' ? '#1B1D17' : n.kind === 'entity' ? '#3A3E30' : '#5C6150'} pointerEvents="none" style={{ paintOrder: 'stroke', stroke: HALO, strokeWidth: 4, strokeLinejoin: 'round' }}>
                      {n.label.length > 26 ? n.label.slice(0, 24) + '…' : n.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* side panel */}
        <div className="space-y-4">
          {selNode ? (
            <div className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="chip" style={{ background: CAT[selNode.cat] + '26', color: '#3B4A22' }}>{selNode.kind === 'category' ? 'cluster' : selNode.recordType || selNode.kind}</span>
                  <h3 className="font-medium mt-1.5">{selNode.label}</h3>
                  {selNode.detail && <p className="text-xs text-muted mt-0.5">{selNode.detail}</p>}
                </div>
                <button className="text-faint hover:text-ink" onClick={() => { setSelected(null); reset() }}><X className="h-4 w-4" /></button>
              </div>
              {selConns.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wider text-faint mb-1.5">Verbonden ({selConns.length})</div>
                  <div className="space-y-1 max-h-60 overflow-auto pr-1">
                    {selConns.map((c) => (
                      <button key={c.id} onClick={() => onNode(c)} className="w-full flex items-center gap-2 text-left text-sm rounded-lg p-1.5 hover:bg-sunken">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: CAT[c.cat] }} />
                        <span className="truncate flex-1">{c.label}</span>
                        <span className="text-[10px] text-faint shrink-0">{c.recordType || c.kind}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-4">
              <SectionTitle hint="Tik een cluster, knoop of suggestie om erheen te navigeren.">Suggesties</SectionTitle>
              {brain.suggestions.length ? (
                <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
                  {brain.suggestions.map((sg) => {
                    const t = TONE[sg.tone]; const Icon = t.icon; const active = focus === sg.nodeIds
                    return (
                      <button key={sg.id} onClick={() => showSuggestion(sg)} className={`w-full text-left card shadow-none p-3 border ${t.cls} ${active ? 'ring-2 ring-forest/30' : ''}`}>
                        <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-ink-soft shrink-0" /><span className="text-sm font-medium flex-1">{sg.title}</span><span className="text-[10px] text-faint uppercase">{t.label}</span></div>
                        <p className="text-xs text-muted mt-1">{sg.detail}</p>
                      </button>
                    )
                  })}
                </div>
              ) : <Empty>Nog te weinig data voor verbanden.</Empty>}
            </div>
          )}

          <div className="card p-3">
            <div className="text-[11px] font-medium text-ink mb-2">Clusters</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted">
              {brain.categories.map((c) => (
                <button key={c.id} onClick={() => { const node = byId[`cat:${c.id}`]; if (node) onNode(node) }} className="flex items-center gap-1.5 hover:text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT[c.id] }} /> {c.label}
                </button>
              ))}
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: CROSS }} /> cross-relatie</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
