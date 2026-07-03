// ── Mindmap force simulation + camera math (framework-agnostic) ─────────────
// Extracted from views/Mindmap.tsx. No React in here: the component owns the
// refs, rAF loop and gesture wiring, and calls into these functions each frame.
//
// Mutation semantics are intentional and load-bearing: sim nodes and the
// camera are mutated IN PLACE (the component holds them in refs and reads the
// same objects every frame). Do not convert these to immutable updates.

export interface SimNode { x: number; y: number; vx: number; vy: number }
export interface Camera { x: number; y: number; k: number }
export interface HomePos { x: number; y: number }

// Structural stand-ins for graph.ts BNode/BEdge — only what the sim reads.
export interface GraphNodeLike { id: string; kind: string; parent?: string | null }
export interface GraphEdgeLike { a: string; b: string; kind: string }

/** Below this alpha the sim is "settled" and only idle-drifts. */
export const ALPHA_MIN = 0.015

// ── layout ───────────────────────────────────────────────────────────────────

/**
 * Radial "home" layout: categories on a ring, children fanned out from their
 * hub, recursively. Pure — returns a fresh position map.
 */
export const computeHomeLayout = (
  nodes: GraphNodeLike[],
  childrenOf: Record<string, GraphNodeLike[]>,
): Record<string, HomePos> => {
  const p: Record<string, HomePos> = {}
  const cats = nodes.filter((n) => n.kind === 'category')
  cats.forEach((c, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / cats.length
    p[c.id] = { x: 260 * Math.cos(a), y: 260 * Math.sin(a) }
  })
  const place = (hubId: string, depth: number) => {
    const hub = p[hubId]; if (!hub) return
    const kids   = childrenOf[hubId] || []
    if (!kids.length) return
    const base   = Math.atan2(hub.y, hub.x)
    const rad    = depth === 1 ? 115 : 65
    const spread = depth === 1 ? Math.PI * 0.88 : Math.PI * 1.3
    kids.forEach((k, i) => {
      const a = kids.length === 1 ? base : base - spread / 2 + (spread * i) / (kids.length - 1)
      p[k.id] = { x: hub.x + rad * Math.cos(a), y: hub.y + rad * Math.sin(a) }
      place(k.id, depth + 1)
    })
  }
  cats.forEach((c) => place(c.id, 1))
  return p
}

// ── sim nodes ────────────────────────────────────────────────────────────────

/** Get-or-create a sim node, seeded at its home position (random if no home). */
export const seedSimNode = (
  sim: Map<string, SimNode>,
  id: string,
  home: Record<string, HomePos>,
): SimNode => {
  let v = sim.get(id)
  if (!v) {
    const h = home[id] || { x: (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 200 }
    v = { x: h.x, y: h.y, vx: 0, vy: 0 }
    sim.set(id, v)
  }
  return v
}

/**
 * One physics tick. Mutates sim nodes in place; returns the new alpha.
 *
 * While alpha > ALPHA_MIN: categories are pinned to home, all other nodes get
 * pairwise repulsion + edge springs, then damped integration (the dragged
 * node, if any, is excluded from integration). Once settled, nodes idle-drift
 * on sine waves instead.
 */
export const physicsStep = (opts: {
  sim: Map<string, SimNode>
  nodes: GraphNodeLike[]
  edges: GraphEdgeLike[]
  home: Record<string, HomePos>
  byId: Record<string, GraphNodeLike | undefined>
  alpha: number
  /** node currently held by a pointer — skipped by integration/drift */
  draggedId: string | null
  /** clock for idle drift; defaults to Date.now() (injectable for tests) */
  now?: number
}): number => {
  const { sim, nodes, edges, home, byId, draggedId } = opts
  nodes.forEach((n) => seedSimNode(sim, n.id, home))

  const a = opts.alpha
  if (a > ALPHA_MIN) {
    nodes.forEach((n) => {
      if (n.kind !== 'category') return
      const S = sim.get(n.id)!; const h = home[n.id]
      S.x = h.x; S.y = h.y; S.vx = 0; S.vy = 0
    })
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const A = sim.get(nodes[i].id)!, B = sim.get(nodes[j].id)!
        let dx = A.x - B.x, dy = A.y - B.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { d2 = 1; dx = 0.5; dy = 0.5 }
        const d = Math.sqrt(d2), f = (2600 / d2) * a
        const fx = (dx / d) * f, fy = (dy / d) * f
        if (nodes[i].kind !== 'category') { A.vx += fx; A.vy += fy }
        if (nodes[j].kind !== 'category') { B.vx -= fx; B.vy -= fy }
      }
    }
    edges.forEach((e) => {
      const A = sim.get(e.a), B = sim.get(e.b)
      if (!A || !B) return
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1
      const L  = e.kind === 'cross' ? 220
        : (byId[e.a]?.kind === 'category' || byId[e.b]?.kind === 'category') ? 118 : 72
      const ks = (e.kind === 'cross' ? 0.01 : 0.055) * a
      const f  = (d - L) * ks, fx = (dx / d) * f, fy = (dy / d) * f
      if (byId[e.a]?.kind !== 'category') { A.vx += fx; A.vy += fy }
      if (byId[e.b]?.kind !== 'category') { B.vx -= fx; B.vy -= fy }
    })
    nodes.forEach((n) => {
      if (n.kind === 'category' || n.id === draggedId) return
      const S = sim.get(n.id)!
      S.vx *= 0.80; S.vy *= 0.80; S.x += S.vx; S.y += S.vy
    })
    return a * 0.97
  }

  const t = (opts.now ?? Date.now()) * 0.00045
  nodes.forEach((n, i) => {
    if (n.kind === 'category' || n.id === draggedId) return
    const S = sim.get(n.id)!, ph = i * 0.83
    S.x += Math.sin(t + ph) * 0.07; S.y += Math.cos(t + ph * 1.31) * 0.07
  })
  return a
}

// ── camera math ──────────────────────────────────────────────────────────────

/** Camera that fits the given points (with padding) into a w×h viewport. Pure. */
export const fitCamera = (
  pts: HomePos[],
  w: number,
  h: number,
): Camera | null => {
  if (!pts.length) return null
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const pad  = 90
  const minx = Math.min(...xs) - pad, maxx = Math.max(...xs) + pad
  const miny = Math.min(...ys) - pad, maxy = Math.max(...ys) + pad
  const k  = Math.min(2.5, Math.max(0.28, Math.min(w / (maxx - minx), h / (maxy - miny))))
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2
  return { k, x: w / 2 - cx * k, y: h / 2 - cy * k }
}

/**
 * Ease cam one step (11%) toward target, mutating cam in place.
 * Returns true once cam is close enough for the caller to snap to the target.
 */
export const stepCameraToward = (cam: Camera, target: Camera): boolean => {
  cam.x += (target.x - cam.x) * 0.11
  cam.y += (target.y - cam.y) * 0.11
  cam.k += (target.k - cam.k) * 0.11
  return Math.abs(target.x - cam.x) < 0.4
    && Math.abs(target.y - cam.y) < 0.4
    && Math.abs(target.k - cam.k) < 0.003
}

/** Zoom the camera by factor f keeping screen point (cx, cy) fixed. Mutates cam. */
export const zoomCameraAround = (cam: Camera, cx: number, cy: number, f: number): void => {
  const k = Math.min(5, Math.max(0.2, cam.k * f))
  const wx = (cx - cam.x) / cam.k, wy = (cy - cam.y) / cam.k
  cam.x = cx - wx * k; cam.y = cy - wy * k; cam.k = k
}

/** Nearest node within 20 screen-px of screen point (sx, sy), or null. */
export const hitTestNode = <N extends GraphNodeLike>(
  sim: Map<string, SimNode>,
  nodes: N[],
  cam: Camera,
  sx: number,
  sy: number,
): N | null => {
  const k = cam.k
  let best: N | null = null, bestD = 20 / k
  nodes.forEach((n) => {
    const S = sim.get(n.id); if (!S) return
    const wx = (sx - cam.x) / k, wy = (sy - cam.y) / k
    const d = Math.hypot(S.x - wx, S.y - wy)
    if (d < bestD) { bestD = d; best = n }
  })
  return best
}
