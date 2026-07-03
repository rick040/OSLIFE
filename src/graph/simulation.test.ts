import { describe, it, expect } from 'vitest'
import {
  computeHomeLayout, seedSimNode, physicsStep, fitCamera, stepCameraToward,
  zoomCameraAround, hitTestNode, ALPHA_MIN, type SimNode,
} from './simulation'

const N = (id: string, kind: string) => ({ id, kind })

const makeWorld = () => {
  const nodes = [N('cat:a', 'category'), N('r1', 'record'), N('r2', 'record')]
  const edges = [
    { a: 'cat:a', b: 'r1', kind: 'parent' },
    { a: 'cat:a', b: 'r2', kind: 'parent' },
  ]
  const home = {
    'cat:a': { x: 0, y: 0 },
    r1: { x: 30, y: 0 },
    r2: { x: 31, y: 1 },
  }
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const sim = new Map<string, SimNode>()
  return { nodes, edges, home, byId, sim }
}

describe('physicsStep', () => {
  it('is deterministic and mutates sim nodes in place', () => {
    const run = () => {
      const w = makeWorld()
      let alpha = 1
      for (let i = 0; i < 60; i++) {
        alpha = physicsStep({ ...w, alpha, draggedId: null, now: 0 })
      }
      return { alpha, r1: w.sim.get('r1')!, r2: w.sim.get('r2')! }
    }
    const a = run(), b = run()
    expect(a.r1).toEqual(b.r1)
    expect(a.r2).toEqual(b.r2)
    expect(a.alpha).toBeCloseTo(b.alpha, 12)
    // records pushed apart from their near-overlapping seeds
    expect(Math.hypot(a.r1.x - a.r2.x, a.r1.y - a.r2.y)).toBeGreaterThan(10)
    // alpha decays by 0.97 per active tick
    expect(a.alpha).toBeCloseTo(0.97 ** 60, 12)
  })

  it('pins categories to home and skips the dragged node', () => {
    const w = makeWorld()
    const dragged = seedSimNode(w.sim, 'r1', w.home)
    dragged.x = 500; dragged.y = 500
    physicsStep({ ...w, alpha: 1, draggedId: 'r1', now: 0 })
    expect(w.sim.get('cat:a')).toEqual({ x: 0, y: 0, vx: 0, vy: 0 })
    expect(w.sim.get('r1')!.x).toBe(500)
    expect(w.sim.get('r1')!.y).toBe(500)
  })

  it('only idle-drifts once alpha is at or below the floor', () => {
    const w = makeWorld()
    const before = physicsStep({ ...w, alpha: ALPHA_MIN, draggedId: null, now: 1000 })
    expect(before).toBe(ALPHA_MIN) // alpha unchanged when settled
    const p1 = { ...w.sim.get('r1')! }
    physicsStep({ ...w, alpha: ALPHA_MIN, draggedId: null, now: 2000 })
    const p2 = w.sim.get('r1')!
    expect(p1.x).not.toBe(p2.x) // drift moved it, deterministically per `now`
  })
})

describe('camera math', () => {
  it('fitCamera centers the bbox and clamps zoom', () => {
    expect(fitCamera([], 800, 600)).toBeNull()
    const c = fitCamera([{ x: -100, y: -50 }, { x: 100, y: 50 }], 800, 560)!
    expect(c.k).toBeLessThanOrEqual(2.5)
    expect(c.k).toBeGreaterThanOrEqual(0.28)
    // bbox center (0,0) maps to viewport center
    expect(0 * c.k + c.x).toBeCloseTo(400)
    expect(0 * c.k + c.y).toBeCloseTo(280)
  })

  it('zoomCameraAround keeps the anchor screen point fixed and clamps k', () => {
    const cam = { x: 10, y: 20, k: 1 }
    const world = { x: (150 - cam.x) / cam.k, y: (160 - cam.y) / cam.k }
    zoomCameraAround(cam, 150, 160, 1.12)
    expect(world.x * cam.k + cam.x).toBeCloseTo(150)
    expect(world.y * cam.k + cam.y).toBeCloseTo(160)
    zoomCameraAround(cam, 0, 0, 1000)
    expect(cam.k).toBe(5)
    zoomCameraAround(cam, 0, 0, 0.0001)
    expect(cam.k).toBe(0.2)
  })

  it('stepCameraToward eases 11% per tick and reports arrival', () => {
    const cam = { x: 0, y: 0, k: 1 }
    const tgt = { x: 100, y: 0, k: 1 }
    expect(stepCameraToward(cam, tgt)).toBe(false)
    expect(cam.x).toBeCloseTo(11)
    const near = { x: 99.9, y: 0, k: 1 }
    expect(stepCameraToward(near, tgt)).toBe(true)
  })
})

describe('layout + hit testing', () => {
  it('computeHomeLayout places categories on a ring and children around hubs', () => {
    const nodes = [N('cat:a', 'category'), N('cat:b', 'category'), N('k1', 'record')]
    const home = computeHomeLayout(nodes, { 'cat:a': [N('k1', 'record')] })
    expect(Math.hypot(home['cat:a'].x, home['cat:a'].y)).toBeCloseTo(260)
    expect(Math.hypot(home['cat:b'].x, home['cat:b'].y)).toBeCloseTo(260)
    const d = Math.hypot(home.k1.x - home['cat:a'].x, home.k1.y - home['cat:a'].y)
    expect(d).toBeCloseTo(115) // depth-1 radius
  })

  it('hitTestNode picks the nearest node within 20 screen px', () => {
    const sim = new Map<string, SimNode>([
      ['a', { x: 0, y: 0, vx: 0, vy: 0 }],
      ['b', { x: 100, y: 0, vx: 0, vy: 0 }],
    ])
    const nodes = [N('a', 'record'), N('b', 'record')]
    const cam = { x: 0, y: 0, k: 1 }
    expect(hitTestNode(sim, nodes, cam, 5, 5)?.id).toBe('a')
    expect(hitTestNode(sim, nodes, cam, 95, 0)?.id).toBe('b')
    expect(hitTestNode(sim, nodes, cam, 50, 50)).toBeNull()
  })
})
