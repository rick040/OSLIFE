import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Empty } from '../components/ui'
import { buildBrain, type CatId, type BNode, type GSuggestion } from '../graph'
import { Network, Zap, Lightbulb, Eye, X, Plus, Minus, Maximize2, Layers } from 'lucide-react'

// ── dark Obsidian palette ──────────────────────────────────────────────────
const BG = '#0D0F15'
const CAT_COL: Record<CatId, string> = {
  work:   '#7BAEC8',
  money:  '#7DC896',
  health: '#D08898',
  habits: '#D4B070',
  goals:  '#A898C8',
  mind:   '#96B884',
}
const EDGE_DIM  = '#1E2330'
const EDGE_LIT  = '#3A4858'
const CROSS_DIM = '#253040'
const CROSS_HI  = '#5A88A8'

const TONE: Record<string, { bg: string; border: string; text: string; icon: typeof Zap; label: string }> = {
  action:  { bg: '#101820', border: '#2A4060', text: '#7BAEC8', icon: Zap,       label: 'actie' },
  insight: { bg: '#12101C', border: '#352A50', text: '#A898C8', icon: Lightbulb, label: 'inzicht' },
  watch:   { bg: '#1A1408', border: '#503A18', text: '#D4B070', icon: Eye,       label: 'let op' },
}

const dotR = (n: BNode) => n.kind === 'category' ? 11 : n.kind === 'entity' ? 6.5 : 4

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
      p[c.id] = { x: 260 * Math.cos(a), y: 260 * Math.sin(a) }
    })
    const place = (hubId: string, depth: number) => {
      const hub = p[hubId]; if (!hub) return
      const kids = childrenOf[hubId] || []
      if (!kids.length) return
      const base  = Math.atan2(hub.y, hub.x)
      const rad   = depth === 1 ? 115 : 65
      const spread = depth === 1 ? Math.PI * 0.88 : Math.PI * 1.3
      kids.forEach((k, i) => {
        const a = kids.length === 1 ? base : base - spread / 2 + (spread * i) / (kids.length - 1)
        p[k.id] = { x: hub.x + rad * Math.cos(a), y: hub.y + rad * Math.sin(a) }
        place(k.id, depth + 1)
      })
    }
    cats.forEach((c) => place(c.id, 1))
    return p
  }, [brain, childrenOf])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [focus,    setFocus]    = useState<string[] | null>(null)
  const [size,     setSize]     = useState({ w: 800, h: 560 })
  const [,         setFrame]    = useState(0)

  const wrapRef  = useRef<HTMLDivElement>(null)
  const svgRef   = useRef<SVGSVGElement>(null)
  const sim      = useRef(new Map<string, { x: number; y: number; vx: number; vy: number }>())
  const cam      = useRef({ x: 400, y: 280, k: 0.85 })
  const camTgt   = useRef<{ x: number; y: number; k: number } | null>(null)
  const alpha    = useRef(1)
  const followUntil = useRef(0)
  const ivRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef   = useRef(0)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture  = useRef({ moved: false, dist: 0, nodeId: null as string | null })
  const mounted  = useRef(false)

  // ── progressive disclosure ─────────────────────────────────────────────
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

  // live refs the step loop reads
  const visRef  = useRef(visNodes); visRef.current  = visNodes
  const edgeRef = useRef(visEdges); edgeRef.current = visEdges
  const homeRef = useRef(home);     homeRef.current = home
  const byIdRef = useRef(byId);     byIdRef.current = byId
  const sizeRef = useRef(size);     sizeRef.current = size
  const focusRef = useRef<string[] | null>(null)

  // ── sim helpers ────────────────────────────────────────────────────────
  const seed = (id: string) => {
    let v = sim.current.get(id)
    if (!v) {
      const h = homeRef.current[id] || { x: (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 200 }
      v = { x: h.x, y: h.y, vx: 0, vy: 0 }
      sim.current.set(id, v)
    }
    return v
  }

  const bboxCam = (ids: string[]) => {
    const pts = ids.map(seed)
    if (!pts.length) return null
    const { w, h } = sizeRef.current
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const pad  = 90
    const minx = Math.min(...xs) - pad, maxx = Math.max(...xs) + pad
    const miny = Math.min(...ys) - pad, maxy = Math.max(...ys) + pad
    const k  = Math.min(2.5, Math.max(0.28, Math.min(w / (maxx - minx), h / (maxy - miny))))
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2
    return { k, x: w / 2 - cx * k, y: h / 2 - cy * k }
  }

  // ── physics step ───────────────────────────────────────────────────────
  const step = () => {
    const nodes  = visRef.current
    const edges  = edgeRef.current
    const home2  = homeRef.current
    const byId2  = byIdRef.current
    nodes.forEach((n) => seed(n.id))

    const a = alpha.current
    if (a > 0.015) {
      // pin categories to home
      nodes.forEach((n) => {
        if (n.kind !== 'category') return
        const S = sim.current.get(n.id)!
        const h = home2[n.id]
        S.x = h.x; S.y = h.y; S.vx = 0; S.vy = 0
      })
      // repulsion O(n²)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const A = sim.current.get(nodes[i].id)!, B = sim.current.get(nodes[j].id)!
          let dx = A.x - B.x, dy = A.y - B.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) { d2 = 1; dx = 0.5; dy = 0.5 }
          const d  = Math.sqrt(d2)
          const f  = (2600 / d2) * a
          const fx = (dx / d) * f, fy = (dy / d) * f
          if (nodes[i].kind !== 'category') { A.vx += fx; A.vy += fy }
          if (nodes[j].kind !== 'category') { B.vx -= fx; B.vy -= fy }
        }
      }
      // spring links
      edges.forEach((e) => {
        const A = sim.current.get(e.a), B = sim.current.get(e.b)
        if (!A || !B) return
        const dx = B.x - A.x, dy = B.y - A.y
        const d  = Math.hypot(dx, dy) || 1
        const L  = e.kind === 'cross' ? 220
          : (byId2[e.a]?.kind === 'category' || byId2[e.b]?.kind === 'category') ? 118 : 72
        const ks = (e.kind === 'cross' ? 0.01 : 0.055) * a
        const f  = (d - L) * ks
        const fx = (dx / d) * f, fy = (dy / d) * f
        if (byId2[e.a]?.kind !== 'category') { A.vx += fx; A.vy += fy }
        if (byId2[e.b]?.kind !== 'category') { B.vx -= fx; B.vy -= fy }
      })
      // integrate
      nodes.forEach((n) => {
        if (n.kind === 'category' || n.id === gesture.current.nodeId) return
        const S = sim.current.get(n.id)!
        S.vx *= 0.80; S.vy *= 0.80
        S.x  += S.vx;  S.y  += S.vy
      })
      alpha.current *= 0.97
    } else {
      // idle: gentle Lissajous drift
      const t = Date.now() * 0.00045
      nodes.forEach((n, i) => {
        if (n.kind === 'category' || n.id === gesture.current.nodeId) return
        const S = sim.current.get(n.id)!
        const ph = i * 0.83
        S.x += Math.sin(t + ph) * 0.07
        S.y += Math.cos(t + ph * 1.31) * 0.07
      })
    }

    // camera lerp
    if (focusRef.current && performance.now() < followUntil.current) {
      const t = bboxCam(focusRef.current)
      if (t) camTgt.current = t
    }
    if (camTgt.current) {
      const c = cam.current, t = camTgt.current
      const spd = 0.11
      c.x += (t.x - c.x) * spd
      c.y += (t.y - c.y) * spd
      c.k += (t.k - c.k) * spd
      if (Math.abs(t.x - c.x) < 0.4 && Math.abs(t.y - c.y) < 0.4 && Math.abs(t.k - c.k) < 0.003) {
        cam.current = { ...t }; camTgt.current = null
      }
    }

    setFrame((f) => (f + 1) % 1_000_000)
  }

  // ── animation loop: rAF primary + setInterval keepalive ───────────────
  useEffect(() => {
    let lastRaf = performance.now()

    const rafLoop = (t: number) => {
      lastRaf = t
      step()
      rafRef.current = requestAnimationFrame(rafLoop)
    }
    rafRef.current = requestAnimationFrame(rafLoop)

    // keepalive: if rAF is throttled (hidden tab / preview tool), run at ~10fps
    ivRef.current = setInterval(() => {
      if (performance.now() - lastRaf > 200) step()
    }, 100)

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (ivRef.current) clearInterval(ivRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // reheat on visible-set changes
  useEffect(() => { alpha.current = 1 }, [visNodes, visEdges])

  // ── resize + auto-fit ─────────────────────────────────────────────────
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

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      // immediate fit on first render (before ResizeObserver may fire)
      brain.categories.forEach((c) => seed(`cat:${c.id}`))
      const t = bboxCam(brain.categories.map((c) => `cat:${c.id}`))
      if (t) cam.current = t
    } else if (!selected && expanded.size === 0) {
      const t = bboxCam(brain.categories.map((c) => `cat:${c.id}`))
      if (t) camTgt.current = t
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  // ── navigation helpers ────────────────────────────────────────────────
  const animateTo = (ids: string[]) => {
    focusRef.current = ids
    followUntil.current = performance.now() + 900
    alpha.current = 0.5
  }

  const reset = () => {
    brain.categories.forEach((c) => seed(`cat:${c.id}`))
    const t = bboxCam(brain.categories.map((c) => `cat:${c.id}`))
    if (t) camTgt.current = t
    focusRef.current = null
  }

  const ancestorsOf = (id: string) => {
    const o: string[] = []; let p = byId[id]?.parent ?? null
    while (p) { o.push(p); p = byId[p]?.parent ?? null }
    return o
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
        const nb = brain.edges
          .filter((e) => e.a === n.id || e.b === n.id)
          .map((e) => (e.a === n.id ? e.b : e.a))
        animateTo([n.id, ...nb])
      } else reset()
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

  // ── pointer events (all on SVG, hit-test for nodes) ───────────────────
  const localXY = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - cam.current.x) / cam.current.k,
    y: (sy - cam.current.y) / cam.current.k,
  })

  const hitTest = (wx: number, wy: number): BNode | null => {
    let best: BNode | null = null
    let bestD = Infinity
    const HIT_WORLD = 18 / cam.current.k
    visRef.current.forEach((n) => {
      const S = sim.current.get(n.id)
      if (!S) return
      const d = Math.hypot(S.x - wx, S.y - wy)
      if (d < HIT_WORLD && d < bestD) { bestD = d; best = n }
    })
    return best
  }

  const zoomAround = (cx: number, cy: number, f: number) => {
    const c = cam.current
    const k = Math.min(5, Math.max(0.2, c.k * f))
    const wx = (cx - c.x) / c.k, wy = (cy - c.y) / c.k
    c.x = cx - wx * k; c.y = cy - wy * k; c.k = k
    camTgt.current = null
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    ;(e.currentTarget).setPointerCapture(e.pointerId)
    const scr = localXY(e)
    const wld = screenToWorld(scr.x, scr.y)
    const hit = hitTest(wld.x, wld.y)
    pointers.current.set(e.pointerId, scr)
    gesture.current = { moved: false, dist: 0, nodeId: hit?.id ?? null }
    camTgt.current = null
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    const cur  = localXY(e)
    pointers.current.set(e.pointerId, cur)
    const pts = [...pointers.current.values()]

    if (pts.length >= 2) {
      const [a, b] = pts
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (gesture.current.dist) zoomAround(mid.x, mid.y, dist / gesture.current.dist)
      gesture.current.dist = dist; gesture.current.moved = true
    } else {
      const dx = cur.x - prev.x, dy = cur.y - prev.y
      if (Math.abs(dx) + Math.abs(dy) > 2) gesture.current.moved = true
      if (gesture.current.nodeId) {
        // drag node in world space
        const S = sim.current.get(gesture.current.nodeId)
        if (S) { S.x += dx / cam.current.k; S.y += dy / cam.current.k; S.vx = 0; S.vy = 0 }
      } else {
        cam.current.x += dx; cam.current.y += dy
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const { moved, nodeId } = gesture.current
    pointers.current.delete(e.pointerId)
    gesture.current.dist = 0

    if (pointers.current.size === 0) {
      if (!moved && nodeId) {
        const n = byId[nodeId]; if (n) onNode(n)
      } else if (!moved && !nodeId) {
        setSelected(null); setFocus(null)
      }
      gesture.current.nodeId = null
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const l = localXY(e)
    zoomAround(l.x, l.y, e.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  const zoomBtn = (f: number) => zoomAround(size.w / 2, size.h / 2, f)

  // ── render coordinates ────────────────────────────────────────────────
  const ck = cam.current.k, cx = cam.current.x, cy = cam.current.y
  const P  = (id: string) => { const v = seed(id); return { x: v.x * ck + cx, y: v.y * ck + cy } }
  const showRecordLabels = ck > 1.15 || !!highlight

  const selNode  = selected ? byId[selected] : null
  const selConns = selected
    ? brain.edges.filter((e) => e.a === selected || e.b === selected)
        .map((e) => byId[e.a === selected ? e.b : e.a]).filter(Boolean)
    : []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Network className="h-5 w-5 text-forest" /> Second brain
        </h1>
        <p className="text-sm text-muted mt-1">
          Tik een cluster om te openen en dichterbij te zoomen. Sleep nodes vrij. Scroll of pinch om te zoomen. Blauwe stippellijnen zijn cross-relaties tussen domeinen.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* canvas */}
        <div
          ref={wrapRef}
          className="lg:col-span-2 rounded-3xl overflow-hidden relative"
          style={{ background: BG, touchAction: 'none' }}
        >
          {/* zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex gap-1">
            {([
              { Icon: Plus,      fn: () => zoomBtn(1.25),                title: 'Inzoomen' },
              { Icon: Minus,     fn: () => zoomBtn(1 / 1.25),            title: 'Uitzoomen' },
              { Icon: Maximize2, fn: reset,                              title: 'Alles tonen' },
              { Icon: Layers,    fn: () => { setExpanded(new Set()); setSelected(null); setFocus(null); reset() }, title: 'Inklappen' },
            ] as const).map(({ Icon, fn, title }) => (
              <button
                key={title}
                title={title}
                onClick={fn}
                className="flex items-center justify-center h-8 w-8 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.07)', color: '#8898A8' }}
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
            style={{ height: 'clamp(440px, 64vh, 680px)', cursor: 'grab', touchAction: 'none' }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              {/* glow filter */}
              <filter id="glow-cat" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-sel" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="9" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-edge" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <rect width={size.w} height={size.h} fill={BG} />

            {/* cat web: always-on subtle background web */}
            {brain.catLinks.map((l) => {
              const a = P(`cat:${l.a}`), b = P(`cat:${l.b}`)
              return (
                <line
                  key={`cw-${l.a}-${l.b}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={CROSS_DIM}
                  strokeWidth={0.7}
                  strokeDasharray="2 9"
                  opacity={0.6}
                />
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
                  <path
                    key={e.id}
                    d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={lit ? CROSS_HI : CROSS_DIM}
                    strokeWidth={lit ? 1.4 : 0.7}
                    strokeDasharray="5 5"
                    opacity={lit ? 0.9 : 0.35}
                    filter={lit ? 'url(#glow-edge)' : undefined}
                  />
                )
              }
              const nA = byId[e.a], nB = byId[e.b]
              const isCatEdge = nA?.kind === 'category' || nB?.kind === 'category'
              const edgeCol = isCatEdge
                ? CAT_COL[(nA?.kind === 'category' ? nA : nB)!.cat] + '55'
                : lit ? EDGE_LIT : EDGE_DIM
              return (
                <line
                  key={e.id}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={edgeCol}
                  strokeWidth={lit ? (isCatEdge ? 1.2 : 0.8) : 0.5}
                  opacity={lit ? (isCatEdge ? 0.6 : 0.7) : 0.2}
                />
              )
            })}

            {/* nodes */}
            {visNodes.map((n) => {
              const sp  = P(n.id)
              const col = CAT_COL[n.cat]
              const r   = dotR(n)
              const isSel      = selected === n.id
              const lit        = !dimmed || (highlight?.has(n.id) ?? false)
              const alert      = n.flag === 'overdue' || n.flag === 'stressed'
              const collapsed  = n.hub && n.kind !== 'category' && !expanded.has(n.id)
              const showLabel  = n.kind === 'category' || n.kind === 'entity' || isSel || (highlight?.has(n.id) ?? false) || showRecordLabels
              const fs = n.kind === 'category' ? 13 : n.kind === 'entity' ? 11 : 10
              const fw = n.kind === 'category' ? 700 : n.kind === 'entity' ? 600 : 400
              const fc = n.kind === 'category' ? '#EEF0E8' : n.kind === 'entity' ? '#C0C8B8' : '#808878'
              const ls = n.kind === 'category' ? '0.08em' : '0'
              const isDragging = gesture.current.nodeId === n.id

              return (
                <g
                  key={n.id}
                  transform={`translate(${sp.x},${sp.y})`}
                  opacity={dimmed && !lit ? 0.1 : 1}
                  style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
                >
                  {/* outer glow for selected */}
                  {isSel && (
                    <circle r={r + 10} fill={col} opacity={0.12} filter="url(#glow-sel)" />
                  )}
                  {/* pulse ring for categories */}
                  {n.kind === 'category' && (
                    <circle r={r + 5} fill="none" stroke={col} strokeWidth={0.8} opacity={0.25} />
                  )}
                  {/* alert ring */}
                  {alert && !isSel && (
                    <circle r={r + 4} fill="none" stroke="#D08898" strokeWidth={1} opacity={0.6} />
                  )}
                  {/* collapsed hub ring */}
                  {collapsed && (
                    <circle r={r + 4.5} fill="none" stroke={col} strokeWidth={0.7} strokeDasharray="2 3" opacity={0.35} />
                  )}
                  {/* glow halo */}
                  {(n.kind === 'category' || isSel) && (
                    <circle r={r} fill={col} opacity={0.2} filter="url(#glow-cat)" />
                  )}
                  {/* main dot */}
                  <circle
                    r={r}
                    fill={n.kind === 'record' ? 'transparent' : col}
                    stroke={col}
                    strokeWidth={n.kind === 'record' ? 1.2 : 0}
                    opacity={n.kind === 'category' ? 1 : n.kind === 'entity' ? 0.9 : 0.65}
                  />
                  {/* label */}
                  {showLabel && (
                    <text
                      y={-(r + (n.kind === 'category' ? 11 : 8))}
                      textAnchor="middle"
                      fontSize={fs}
                      fontWeight={fw}
                      fill={fc}
                      letterSpacing={ls}
                      pointerEvents="none"
                      style={{ paintOrder: 'stroke', stroke: BG, strokeWidth: 3.5, strokeLinejoin: 'round' }}
                    >
                      {n.label.length > 26 ? n.label.slice(0, 24) + '…' : n.label}
                    </text>
                  )}
                  {/* child count badge on collapsed hub */}
                  {collapsed && ck > 0.65 && (childrenOf[n.id]?.length ?? 0) > 0 && (
                    <text y={r + 12} textAnchor="middle" fontSize={8} fill={col} opacity={0.65} pointerEvents="none">
                      +{childrenOf[n.id].length}
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
                  <span
                    className="inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: CAT_COL[selNode.cat] + '20', color: CAT_COL[selNode.cat] }}
                  >
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
                  <div className="text-[11px] uppercase tracking-wider text-faint mb-1.5">
                    Verbonden ({selConns.length})
                  </div>
                  <div className="space-y-0.5 max-h-64 overflow-auto pr-1">
                    {selConns.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => onNode(c)}
                        className="w-full flex items-center gap-2 text-left text-sm rounded-lg px-2 py-1.5 hover:bg-sunken transition-colors"
                      >
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
              <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">Suggesties</div>
              {brain.suggestions.length ? (
                <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
                  {brain.suggestions.map((sg) => {
                    const t = TONE[sg.tone]; const Icon = t.icon
                    const active = focus === sg.nodeIds
                    return (
                      <button
                        key={sg.id}
                        onClick={() => showSuggestion(sg)}
                        className={`w-full text-left rounded-2xl p-3 border transition-colors ${active ? 'ring-2 ring-forest/30' : ''}`}
                        style={{ background: t.bg, borderColor: t.border }}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: t.text }} />
                          <span className="text-sm font-medium text-ink flex-1">{sg.title}</span>
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: t.text }}>{t.label}</span>
                        </div>
                        <p className="text-xs text-muted mt-1">{sg.detail}</p>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <Empty>Nog te weinig data voor verbanden.</Empty>
              )}
            </div>
          )}

          <div className="card p-3">
            <div className="text-[11px] font-medium text-ink mb-2.5">Clusters</div>
            <div className="space-y-1.5">
              {brain.categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { const node = byId[`cat:${c.id}`]; if (node) onNode(node) }}
                  className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1 hover:bg-sunken transition-colors"
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CAT_COL[c.id] }} />
                  <span className="text-xs text-ink-soft">{c.label}</span>
                  <span className="text-[10px] text-faint ml-auto">
                    {visNodes.filter((n) => n.cat === c.id && n.kind !== 'category').length}
                  </span>
                </button>
              ))}
              <div className="flex items-center gap-2 px-2 pt-1 border-t border-line mt-1">
                <span className="h-0.5 w-5 rounded-full" style={{ background: CROSS_HI, borderTop: '1px dashed' }} />
                <span className="text-[10px] text-faint">cross-relatie</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
