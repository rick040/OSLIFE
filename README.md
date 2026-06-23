# RICK-OS (prototype)

A clickable, high-fidelity preview of **RICK-OS**: a personal life-management "operating
system" that turns scattered noticing into one accumulating memory and surfaces the
cross-domain connections (sleep↔energy, finance↔stress) no single tracker could show.

This is a **prototype** to feel the architecture, not the production system. No backend,
no auth, no real integrations. All state is in-memory + localStorage.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Use **Reset demo** (bottom-left) to restore the seeded state.

## The six layers, mapped to the UI

| Layer | Where to see it |
|------|------------------|
| 1. Intake | **Capture** (active) + seeded passive sense data (sleep, bank, calendar) |
| 2. Understand | **Capture** / **Jarvis** show live classification (domain, kind, sentiment, summary) |
| 3. Remember | **Memory** : three separate stores (Essentials, Threads, Patterns) |
| 4. Reflect | **Reflect** : the keystone, cross-domain correlations + anomalies + pattern write-back |
| 5. Surface | **Today** + **Day Builder** + the nudge + **Jarvis** chat |
| 6. Act | Complete/skip blocks, close threads, tick habits, accept plan, mark paid |

The **two loops** are explained in an in-app diagram ("The two loops" in the sidebar).

## Demo script (≈ 2 min, makes the keystone land)

1. **Capture** : type *"need to chase the van Dijk invoice, getting stressed"* and drop it
   in. Watch it run Intake → Understand → Remember (classified PRJCT / vent / stressed) with
   zero filing decision from you.
2. **Memory** : see it landed as a Thread, sitting beside Patterns (with confidence bars) and
   Essentials, three structurally separate stores.
3. **Reflect** : read the three cross-domain correlations computed live (sleep↔energy,
   spend↔deadlines, takeout↔low-energy) and the two charts that prove them. This is the
   whole point: one brain reading every domain at once.
4. Hit **Run nightly reflect**: confidence scores visibly climb (reinforced) or fall
   (decayed), and it tells you tomorrow's Surface was reshaped.
5. **Day Builder** / **Today**: the plan now has a Reflect-added evening wind-down block and
   the nudge has changed, the slow loop silently reshaped your day.

## Mocked vs. what a real build would wire up

**Mocked here**
- Understand uses a transparent keyword classifier (instant, explainable). Real: an LLM call.
- Passive sense (email, calendar, bank, health, location) is seeded static data.
- Jarvis replies are canned but read from the live seeded memory.
- "Nightly" reflect is a button, not a scheduler.

**A real build would wire up**
- Real intake pipelines: Telegram/voice capture, email + calendar + bank (PSD2) + health APIs.
- An LLM for Understand (classification, summary, embeddings) and for Reflect's correlations.
- A persistent vector + relational store instead of localStorage.
- A scheduler (nightly/weekly) driving Reflect, and push notifications for nudges.
- Auth + multi-device sync.

## Stack

Vite · React · TypeScript · Tailwind CSS · Zustand · lucide-react · recharts. Nothing else.

## Product decisions made along the way

- **Fixed "today" = 2026-06-22** so seeded data lines up deterministically for the demo.
- A captured **task** auto-opens a Thread (an owed loop); other kinds just file as memory.
- Reflect **reinforces** the patterns its current pass has evidence for and **decays** the
  rest (faster when already stale), so confidence is always a live signal.
- Domain color-coding is global: ParkingYou blue, PRJCT purple, Buurtkaart green, Personal
  amber, Cross-domain pink (reserved for the Reflect layer and the slow loop).
