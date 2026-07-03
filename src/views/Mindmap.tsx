import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Empty } from '../components/ui'
import { buildBrain, type CatId, type BNode, type GSuggestion } from '../graph'
import {
  computeHomeLayout, seedSimNode, physicsStep, fitCamera, stepCameraToward,
  zoomCameraAround, hitTestNode, type SimNode,
} from '../graph/simulation'
import {
  Network, Zap, Lightbulb, Eye, X, Plus, Minus, Maximize2, Minimize2, Layers, Tag, GitFork,
} from 'lucide-react'

// ── light branded palette (matches app design system) ─────────────────────
const BG     = '#F4F5EE'
const DOT    = '#C8CDB8'
const CAT_COL: Record<CatId, string> = {
  work:   '#6E8CA8',
  money:  '#6FA07C',
  health: '#C58392',
  habits: '#C6A05B',
  goals:  '#9385B0',
  mind:   '#5C8050',
}
const CAT_LABEL: Record<CatId, string> = {
  work: 'WORK', money: 'MONEY', health: 'HEALTH', habits: 'HABITS', goals: 'GOALS', mind: 'MIND',
}
const EDGE_DIM  = '#D8DDD0'
const EDGE_LIT  = '#A8B4A0'
const CROSS_DIM = '#BCC8D8'
const CROSS_HI  = '#6E8CA8'
const INK       = '#1B1D17'
const MUTED     = '#5C6150'
const FAINT     = '#8C9080'
const HALO      = BG

const TONE: Record<string, { bg: string; border: string; accent: string; icon: typeof Zap; label: string }> = {
  action:  { bg: '#EFF3F8', border: '#BFD0E0', accent: '#3F586E', icon: Zap,       label: 'actie' },
  insight: { bg: '#F3F1F8', border: '#C8C0DC', accent: '#5C4F79', icon: Lightbulb, label: 'inzicht' },
  watch:   { bg: '#FAF4EC', border: '#DDD0B8', accent: '#856325', icon: Eye,       label: 'let op' },
}

const dotR = (n: BNode) => n.kind === 'category' ? 10 : n.kind === 'entity' ? 6 : 4

export default function Mindmap() {
  const s = useStore()
  const brain = useMemo(
    () => buildBrain(
      s.items, s.threads, s.payments, s.projects, s.emails, s.patterns,
      s.transactions, s.dayLogs, s.habits, s.goals, s.milestones, s.healthDays,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.items, s.threads, s.payments, s.projects, s.emails, s.patterns,
     s.transactions, s.dayLogs, s.habits, s.goals, s.milestones, s.healthDays],
  )
  const byId       = useMemo(() => Object.fromEntries(brain.nodes.map((n) => [n.id, n])), [brain])
  const childrenOf = useMemo(() => {
    const m: Record<string, BNode[]> = {}
    brain.nodes.forEach((n) => { if (n.parent) (m[n.parent] ||= []).push(n) })
    return m
  }, [brain])

  const home = useMemo(() => computeHomeLayout(brain.nodes, childrenOf), [brain, childrenOf])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set())
  const [selected,   setSelected]   = useState<string | null>(null)
  const [focus,      setFocus]      = useState<string[] | null>(null)
  const [size,       setSize]       = useState({ w: 800, h: 560 })
  const [,           setFrame]      = useState(0)
  const [hiddenCats, setHiddenCats] = useState<Set<CatId>>(new Set())
  const [showCross,  setShowCross]  = useState(true)
  const [allLabels,  setAllLabels]  = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  // ── sim refs ──────────────────────────────────────────────────────────────
  const wrapRef  = useRef<HTMLDivElement>(null)
  const svgRef   = useRef<SVGSVGElement>(null)
  const sim      = useRef(new Map<string, SimNode>())
  const cam      = useRef({ x: 400, y: 280, k: 0.85 })
  const camTgt   = useRef<{ x: number; y: number; k: number } | null>(null)
  const alpha    = useRef(1)
  const followUntil = useRef(0)
  const ivRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef   = useRef(0)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture  = useRef({ moved: false, dist: 0, nodeId: null as string | null })
  const mounted  = useRef(false)

  // ── visible set (progressive disclosure + hidden cats) ───────────────────
  const visible = useMemo(() => {
    const vis = new Set<string>()
    const ok = (n: BNode): boolean => {
      if (hiddenCats.has(n.cat)) return false
      let p = n.parent
      while (p) { if (!expanded.has(p)) return false; p = byId[p]?.parent ?? null }
      return true
    }
    brain.nodes.forEach((n) => {
      if (n.kind === 'category') { if (!hiddenCats.has(n.cat)) vis.add(n.id) }
      else if (ok(n)) vis.add(n.id)
    })
    return vis
  }, [brain, expanded, byId, hiddenCats])

  const visNodes = useMemo(() => brain.nodes.filter((n) => visible.has(n.id)), [brain, visible])
  const visEdges = useMemo(() => brain.edges.filter((e) => {
    if (!visible.has(e.a) || !visible.has(e.b)) return false
    if (e.kind === 'cross' && !showCross) return false
    return true
  }), [brain, visible, showCross])

  const highlight = useMemo(() => {
    if (selected && byId[selected]?.kind !== 'category') {
      const set = new Set<string>([selected])
      brain.edges.forEach((e) => {
        if (e.a === selected) set.add(e.b)
        if (e.b === selected) set.add(e.a)
      })
      return set
    }
    if (focus) return new Set(focus)
    return null
  }, [selected, focus, brain, byId])
  const dimmed = !!highlight

  // live refs
  const visRef   = useRef(visNodes); visRef.current  = visNodes
  const edgeRef  = useRef(visEdges); edgeRef.current = visEdges
  const homeRef  = useRef(home);     homeRef.current = home
  const byIdRef  = useRef(byId);     byIdRef.current = byId
  const sizeRef  = useRef(size);     sizeRef.current = size
  const focusRef = useRef<string[] | null>(null)

  // ── sim helpers (thin wrappers over graph/simulation, bound to refs) ──────
  const seed = (id: string) => seedSimNode(sim.current, id, homeRef.current)

  const bboxCam = (ids: string[]) => {
    const pts = ids.map(seed)
    const { w, h } = sizeRef.current
    return fitCamera(pts, w, h)
  }

  // ── physics step ──────────────────────────────────────────────────────────
  const step = () => {
    alpha.current = physicsStep({
      sim: sim.current,
      nodes: visRef.current,
      edges: edgeRef.current,
      home: homeRef.current,
      byId: byIdRef.current,
      alpha: alpha.current,
      draggedId: gesture.current.nodeId,
    })

    if (focusRef.current && performance.now() < followUntil.current) {
      const t = bboxCam(focusRef.current)
      if (t) camTgt.current = t
    }
    if (camTgt.current) {
      if (stepCameraToward(cam.current, camTgt.current)) {
        cam.current = { ...camTgt.current }; camTgt.current = null
      }
    }
    setFrame((f) => (f + 1) % 1_000_000)
  }

  // ── animation loop: rAF + setInterval keepalive ───────────────────────────
  useEffect(() => {
    let lastRaf = performance.now()
    const rafLoop = (t: number) => { lastRaf = t; step(); rafRef.current = requestAnimationFrame(rafLoop) }
    rafRef.current = requestAnimationFrame(rafLoop)
    ivRef.current  = setInterval(() => { if (performance.now() - lastRaf > 200) step() }, 100)
    return () => { cancelAnimationFrame(rafRef.current); if (ivRef.current) clearInterval(ivRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { alpha.current = 1 }, [visNodes, visEdges])

  // ── resize + auto-fit ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(300, r.width), h: Math.max(360, r.height) })
    })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      brain.categories.forEach((c) => seed(`cat:${c.id}`))
      const t = bboxCam(brain.categories.map((c) => `cat:${c.id}`))
      if (t) cam.current = t
    } else if (!selected && expanded.size === 0) {
      const t = bboxCam(brain.categories.map((c) => `cat:${c.id}`))
      if (t) camTgt.current = t
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  // ── navigation ────────────────────────────────────────────────────────────
  const animateTo = (ids: string[]) => {
    focusRef.current = ids; followUntil.current = performance.now() + 900; alpha.current = 0.5
  }
  const reset = () => {
    brain.categories.forEach((c) => seed(`cat:${c.id}`))
    const t = bboxCam(brain.categories.map((c) => `cat:${c.id}`))
    if (t) camTgt.current = t; focusRef.current = null
  }
  const ancestorsOf = (id: string) => {
    const o: string[] = []; let p = byId[id]?.parent ?? null
    while (p) { o.push(p); p = byId[p]?.parent ?? null }; return o
  }
  const onNode = (n: BNode) => {
    setFocus(null)
    if (n.hub) {
      const willExpand = !expanded.has(n.id)
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(n.id)) {
          const drop = (id: string) => { next.delete(id); (childrenOf[id] || []).forEach((c) => drop(c.id)) }
          drop(n.id)
        } else next.add(n.id)
        return next
      })
      setSelected(n.id)
      animateTo(willExpand
        ? [n.id, ...(childrenOf[n.id] || []).map((c) => c.id)]
        : n.parent ? [n.parent, ...(childrenOf[n.parent] || []).map((c) => c.id)] : [n.id],
      )
    } else {
      const activate = selected !== n.id
      setSelected(activate ? n.id : null)
      if (activate) {
        const nb = brain.edges.filter((e) => e.a === n.id || e.b === n.id).map((e) => e.a === n.id ? e.b : e.a)
        animateTo([n.id, ...nb])
      } else reset()
    }
  }
  const showSuggestion = (sg: GSuggestion) => {
    setSelected(null)
    const exp = new Set(expanded)
    sg.nodeIds.forEach((id) => ancestorsOf(id).forEach((a) => exp.add(a)))
    setExpanded(exp); setFocus(sg.nodeIds)
    animateTo(sg.nodeIds.length ? sg.nodeIds : brain.categories.map((c) => `cat:${c.id}`))
  }
  const toggleCat = (cat: CatId) => {
    setHiddenCats((prev) => { const next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next })
  }

  // ── pointer events ────────────────────────────────────────────────────────
  const localXY = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const hitTest = (sx: number, sy: number): BNode | null =>
    hitTestNode(sim.current, visRef.current, cam.current, sx, sy)
  const zoomAround = (cx: number, cy: number, f: number) => {
    zoomCameraAround(cam.current, cx, cy, f); camTgt.current = null
  }
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    ;(e.currentTarget).setPointerCapture(e.pointerId)
    const scr = localXY(e), hit = hitTest(scr.x, scr.y)
    pointers.current.set(e.pointerId, scr)
    gesture.current = { moved: false, dist: 0, nodeId: hit?.id ?? null }
    camTgt.current = null
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!, cur = localXY(e)
    pointers.current.set(e.pointerId, cur)
    const pts = [...pointers.current.values()]
    if (pts.length >= 2) {
      const [a, b] = pts, dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (gesture.current.dist) zoomAround(mid.x, mid.y, dist / gesture.current.dist)
      gesture.current.dist = dist; gesture.current.moved = true
    } else {
      const dx = cur.x - prev.x, dy = cur.y - prev.y
      if (Math.abs(dx) + Math.abs(dy) > 2) gesture.current.moved = true
      if (gesture.current.nodeId) {
        const S = sim.current.get(gesture.current.nodeId)
        if (S) { S.x += dx / cam.current.k; S.y += dy / cam.current.k; S.vx = 0; S.vy = 0 }
      } else { cam.current.x += dx; cam.current.y += dy }
    }
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const { moved, nodeId } = gesture.current
    pointers.current.delete(e.pointerId); gesture.current.dist = 0
    if (pointers.current.size === 0) {
      if (!moved && nodeId) { const n = byId[nodeId]; if (n) onNode(n) }
      else if (!moved && !nodeId) { setSelected(null); setFocus(null) }
      gesture.current.nodeId = null
    }
  }
  // ⚠ pointerleave: only clean up tracking — never deselect (prevents reset when mouse exits canvas)
  const onPointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId); gesture.current.dist = 0; gesture.current.nodeId = null
  }
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const l = localXY(e); zoomAround(l.x, l.y, e.deltaY < 0 ? 1.12 : 1 / 1.12)
  }
  const zoomBtn = (f: number) => zoomAround(size.w / 2, size.h / 2, f)

  // ── render coords ─────────────────────────────────────────────────────────
  const ck = cam.current.k, cx = cam.current.x, cy = cam.current.y
  const P  = (id: string) => { const v = seed(id); return { x: v.x * ck + cx, y: v.y * ck + cy } }
  const showRecordLabels = allLabels || ck > 1.15 || !!highlight
  const zoomPct = Math.round(ck * 100)

  const selNode  = selected ? byId[selected] : null
  const selConns = selected
    ? brain.edges.filter((e) => e.a === selected || e.b === selected)
        .map((e) => byId[e.a === selected ? e.b : e.a]).filter(Boolean)
    : []

  // ── outer wrapper: normal vs fullscreen ───────────────────────────────────
  const outer = fullscreen
    ? 'fixed inset-0 z-50 bg-canvas flex flex-col overflow-hidden'
    : 'space-y-3'

  return (
    <div className={outer}>
      {/* header */}
      <div className={`flex items-center justify-between gap-3 ${fullscreen ? 'px-4 pt-3 shrink-0' : ''}`}>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Network className="h-5 w-5 text-forest" /> Second brain
        </h1>
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="btn-ghost !py-1.5 !px-2.5 flex items-center gap-1.5 text-xs"
          title={fullscreen ? 'Verklein' : 'Volledig scherm'}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="hidden sm:inline">{fullscreen ? 'Verkleinen' : 'Volledig scherm'}</span>
        </button>
      </div>

      {/* toolbar: cluster filters + toggles */}
      <div className={`flex flex-wrap gap-2 items-center ${fullscreen ? 'px-4 pb-1 shrink-0' : ''}`}>
        <div className="flex flex-wrap gap-1.5 items-center flex-1 min-w-0">
          {brain.categories.map((c) => {
            const hidden = hiddenCats.has(c.id)
            const col    = CAT_COL[c.id]
            const cnt    = visNodes.filter((n) => n.cat === c.id && n.kind !== 'category').length
            return (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-all"
                style={{
                  background: hidden ? 'transparent' : col + '18',
                  borderColor: hidden ? '#D8DDD0' : col + '60',
                  color: hidden ? FAINT : col,
                  opacity: hidden ? 0.6 : 1,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: hidden ? '#C0C8B0' : col }} />
                {CAT_LABEL[c.id]}
                {!hidden && expanded.size > 0 && cnt > 0 && (
                  <span className="ml-0.5 opacity-60">{cnt}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* cross-relaties toggle */}
          <button
            onClick={() => setShowCross((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-all"
            style={{
              background: showCross ? '#6E8CA818' : 'transparent',
              borderColor: showCross ? '#6E8CA860' : '#D8DDD0',
              color: showCross ? '#3F586E' : FAINT,
            }}
          >
            <GitFork className="h-3 w-3" /> Cross
          </button>
          {/* labels toggle */}
          <button
            onClick={() => setAllLabels((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-all"
            style={{
              background: allLabels ? '#34431F18' : 'transparent',
              borderColor: allLabels ? '#34431F60' : '#D8DDD0',
              color: allLabels ? '#34431F' : FAINT,
            }}
          >
            <Tag className="h-3 w-3" /> Labels
          </button>
          {/* collapse all */}
          <button
            onClick={() => { setExpanded(new Set()); setSelected(null); setFocus(null); reset() }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border border-line text-faint hover:text-ink hover:border-muted transition-all"
          >
            <Layers className="h-3 w-3" /> Inklappen
          </button>
        </div>
      </div>

      {/* content grid */}
      <div className={`${fullscreen ? 'flex-1 grid grid-cols-1 lg:grid-cols-4 overflow-hidden px-4 pb-4 gap-4 min-h-0' : 'grid grid-cols-1 lg:grid-cols-3 gap-4'}`}>

        {/* canvas */}
        <div
          ref={wrapRef}
          className={`relative rounded-3xl overflow-hidden border border-line ${fullscreen ? 'lg:col-span-3' : 'lg:col-span-2'}`}
          style={{ background: BG, touchAction: 'none' }}
        >
          {/* zoom controls + zoom % */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
            <span className="text-[10px] tabular-nums px-1.5" style={{ color: FAINT }}>{zoomPct}%</span>
            {([
              { Icon: Plus,      fn: () => zoomBtn(1.25), title: 'Inzoomen' },
              { Icon: Minus,     fn: () => zoomBtn(1/1.25), title: 'Uitzoomen' },
              { Icon: Maximize2, fn: reset, title: 'Alles tonen' },
            ] as const).map(({ Icon, fn, title }) => (
              <button
                key={title} title={title} onClick={fn}
                className="flex items-center justify-center h-7 w-7 rounded-xl border border-line bg-surface hover:bg-sunken transition-colors"
                style={{ color: MUTED }}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            className="w-full select-none"
            style={{ height: fullscreen ? '100%' : 'clamp(440px, 64vh, 680px)', cursor: 'grab', touchAction: 'none' }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerCancel={onPointerLeave}
          >
            <defs>
              <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.9" fill={DOT} opacity="0.55" />
              </pattern>
              <filter id="glow-node" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-sel" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <rect width={size.w} height={size.h} fill={BG} />
            <rect width={size.w} height={size.h} fill="url(#dots)" />

            {/* background cat web */}
            {showCross && brain.catLinks.map((l) => {
              const a = P(`cat:${l.a}`), b = P(`cat:${l.b}`)
              if (hiddenCats.has(l.a) || hiddenCats.has(l.b)) return null
              return (
                <line key={`cw-${l.a}-${l.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={CROSS_DIM} strokeWidth={0.8} strokeDasharray="2 9" opacity={0.5} />
              )
            })}

            {/* edges */}
            {visEdges.map((e) => {
              const a = P(e.a), b = P(e.b)
              const lit = !dimmed || (highlight!.has(e.a) && highlight!.has(e.b))
              if (e.kind === 'cross') {
                const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.22
                const my = (a.y + b.y) / 2 + (a.x - b.x) * 0.22
                return (
                  <path key={e.id} d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                    fill="none" stroke={lit ? CROSS_HI : CROSS_DIM}
                    strokeWidth={lit ? 1.4 : 0.7} strokeDasharray="5 5"
                    opacity={lit ? 0.85 : 0.3}
                  />
                )
              }
              const nA = byId[e.a], nB = byId[e.b]
              const isCat = nA?.kind === 'category' || nB?.kind === 'category'
              const col   = isCat ? CAT_COL[(nA?.kind === 'category' ? nA : nB)!.cat] + '70' : (lit ? EDGE_LIT : EDGE_DIM)
              return (
                <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={col} strokeWidth={lit ? (isCat ? 1.2 : 0.8) : 0.5}
                  opacity={lit ? (isCat ? 0.7 : 0.75) : 0.22}
                />
              )
            })}

            {/* nodes */}
            {visNodes.map((n) => {
              const sp   = P(n.id)
              const col  = CAT_COL[n.cat]
              const r    = dotR(n)
              const isSel     = selected === n.id
              const lit       = !dimmed || (highlight?.has(n.id) ?? false)
              const alert     = n.flag === 'overdue' || n.flag === 'stressed'
              const collapsed = n.hub && n.kind !== 'category' && !expanded.has(n.id)
              const showLabel = n.kind === 'category' || n.kind === 'entity' || isSel
                || (highlight?.has(n.id) ?? false) || showRecordLabels
              const fs = n.kind === 'category' ? 12.5 : n.kind === 'entity' ? 11 : 10
              const fw = n.kind === 'category' ? 700 : n.kind === 'entity' ? 600 : 400
              const fc = n.kind === 'category' ? INK : n.kind === 'entity' ? '#44483A' : MUTED
              return (
                <g key={n.id} transform={`translate(${sp.x},${sp.y})`}
                  opacity={dimmed && !lit ? 0.12 : 1}
                  style={{ cursor: 'pointer' }}
                >
                  {isSel && <circle r={r + 9} fill={col} opacity={0.1} filter="url(#glow-sel)" />}
                  {n.kind === 'category' && <circle r={r + 4} fill="none" stroke={col} strokeWidth={0.8} opacity={0.2} />}
                  {alert && !isSel && <circle r={r + 4} fill="none" stroke="#C58392" strokeWidth={1} opacity={0.55} />}
                  {collapsed && <circle r={r + 4} fill="none" stroke={col} strokeWidth={0.7} strokeDasharray="2 3" opacity={0.35} />}
                  {(n.kind === 'category' || isSel) && <circle r={r} fill={col} opacity={0.15} filter="url(#glow-node)" />}
                  <circle r={r}
                    fill={n.kind === 'record' ? 'transparent' : col}
                    stroke={col}
                    strokeWidth={n.kind === 'record' ? 1.2 : 0}
                    opacity={n.kind === 'category' ? 1 : n.kind === 'entity' ? 0.85 : 0.6}
                  />
                  {showLabel && (
                    <text y={-(r + (n.kind === 'category' ? 10 : 7))} textAnchor="middle"
                      fontSize={fs} fontWeight={fw} fill={fc}
                      letterSpacing={n.kind === 'category' ? '0.07em' : '0'}
                      pointerEvents="none"
                      style={{ paintOrder: 'stroke', stroke: HALO, strokeWidth: 3.5, strokeLinejoin: 'round' }}
                    >
                      {n.label.length > 26 ? n.label.slice(0, 24) + '…' : n.label}
                    </text>
                  )}
                  {collapsed && ck > 0.65 && (childrenOf[n.id]?.length ?? 0) > 0 && (
                    <text y={r + 11} textAnchor="middle" fontSize={8} fill={col} opacity={0.6} pointerEvents="none">
                      +{childrenOf[n.id].length}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* side panel */}
        <div className={`space-y-3 ${fullscreen ? 'overflow-y-auto' : ''}`}>
          {selNode ? (
            <div className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: CAT_COL[selNode.cat] + '18', color: CAT_COL[selNode.cat] }}>
                    {selNode.kind === 'category' ? 'cluster' : selNode.recordType || selNode.kind}
                  </span>
                  <h3 className="font-medium mt-1.5 text-ink">{selNode.label}</h3>
                  {selNode.detail && <p className="text-xs text-muted mt-0.5">{selNode.detail}</p>}
                </div>
                <button className="text-faint hover:text-ink" onClick={() => { setSelected(null); reset() }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              {selConns.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wider text-faint mb-1.5">Verbonden ({selConns.length})</div>
                  <div className="space-y-0.5 max-h-64 overflow-auto pr-1">
                    {selConns.map((c) => (
                      <button key={c.id} onClick={() => onNode(c)}
                        className="w-full flex items-center gap-2 text-left text-sm rounded-lg px-2 py-1.5 hover:bg-sunken transition-colors">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CAT_COL[c.cat] }} />
                        <span className="truncate flex-1 text-ink-soft">{c.label}</span>
                        <span className="text-[10px] text-faint shrink-0">{c.recordType || c.kind}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-3">Suggesties</div>
              {brain.suggestions.length ? (
                <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
                  {brain.suggestions.map((sg) => {
                    const t = TONE[sg.tone]; const Icon = t.icon; const active = focus === sg.nodeIds
                    return (
                      <button key={sg.id} onClick={() => showSuggestion(sg)}
                        className={`w-full text-left rounded-2xl p-3 border transition-colors ${active ? 'ring-2 ring-forest/20' : ''}`}
                        style={{ background: t.bg, borderColor: t.border }}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: t.accent }} />
                          <span className="text-sm font-medium text-ink flex-1">{sg.title}</span>
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: t.accent }}>{t.label}</span>
                        </div>
                        <p className="text-xs text-muted mt-1">{sg.detail}</p>
                      </button>
                    )
                  })}
                </div>
              ) : <Empty>Nog te weinig data voor verbanden.</Empty>}
            </div>
          )}

          <div className="card p-3">
            <div className="text-[11px] font-medium text-ink mb-2.5">Clusters</div>
            <div className="space-y-1">
              {brain.categories.map((c) => {
                const total = brain.nodes.filter((n) => n.cat === c.id && n.kind !== 'category').length
                const hidden = hiddenCats.has(c.id)
                return (
                  <button key={c.id} onClick={() => { const node = byId[`cat:${c.id}`]; if (node) onNode(node) }}
                    className={`w-full flex items-center gap-2 text-left rounded-lg px-2 py-1 hover:bg-sunken transition-colors ${hidden ? 'opacity-40' : ''}`}>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CAT_COL[c.id] }} />
                    <span className="text-xs text-ink-soft flex-1">{CAT_LABEL[c.id]}</span>
                    <span className="text-[10px] text-faint tabular-nums">{total}</span>
                  </button>
                )
              })}
              {showCross && (
                <div className="flex items-center gap-2 px-2 pt-1.5 mt-0.5 border-t border-line">
                  <span className="inline-block w-5 h-px" style={{ borderTop: `1px dashed ${CROSS_HI}` }} />
                  <span className="text-[10px] text-faint">cross-relatie</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
