#!/usr/bin/env node
// Regenerates src/workout/data/exerciseLibrary.json from the upstream
// hasaneyldrm/exercises-dataset (https://github.com/hasaneyldrm/exercises-dataset,
// MIT-licensed metadata). Keeps the same trimmed fields as before (English
// instructions only, no other 9 instruction languages) and adds `image` /
// `gifUrl` — absolute raw.githubusercontent.com URLs for the 180x180 stills
// and animation GIFs. Those media files are excluded from this repo (© Gym
// visual, https://gymvisual.com/, redistributed under the dataset's terms)
// and are hotlinked instead of bundled.
//
// Usage: node scripts/build-exercise-library.mjs [path-to-local-exercises.json]

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json'
const MEDIA_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main'
const OUT_PATH = fileURLToPath(new URL('../src/workout/data/exerciseLibrary.json', import.meta.url))

async function loadSource() {
  const localPath = process.argv[2]
  if (localPath) {
    const { readFile } = await import('node:fs/promises')
    return JSON.parse(await readFile(localPath, 'utf8'))
  }
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`fetch ${SOURCE_URL} failed: ${res.status}`)
  return res.json()
}

const raw = await loadSource()

const trimmed = raw.map((e) => ({
  id: e.id,
  name: e.name,
  bodyPart: e.body_part,
  target: e.target,
  secondaryMuscles: e.secondary_muscles ?? [],
  equipment: e.equipment,
  instructions: e.instruction_steps?.en ?? [],
  image: `${MEDIA_BASE}/${e.image}`,
  gifUrl: `${MEDIA_BASE}/${e.gif_url}`,
}))

await writeFile(OUT_PATH, JSON.stringify(trimmed, null, 0), 'utf8')
console.log(`Wrote ${trimmed.length} exercises to ${OUT_PATH}`)
