// ── HEYRA agent · Financiën ────────────────────────────────────────────────────
// Extracted from the money branch of the old Heyra.tsx#answer(). The rule-based
// fallback text is unchanged — it's the exact string HEYRA has always given.
// When the brain is available, it gets the same real payment facts and is
// asked to phrase the answer + flag anything worth doing, but it never invents
// a number: every euro figure in the prompt comes straight from the store.

import { askBrain } from '../brainClient'
import type { Agent } from './types'

export const runFinanceAgent: Agent = async (_input, ctx) => {
  const { store } = ctx
  const openPayments = store.payments
    .filter((p) => p.status === 'open')
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const outgoing = openPayments.filter((p) => p.direction === 'outgoing')
  const incoming = openPayments.filter((p) => p.direction === 'incoming')

  if (!outgoing.length && !incoming.length) {
    return { text: 'Geen openstaande betalingen — alles is afgehandeld.', topic: 'money' }
  }

  const lines: string[] = []
  if (outgoing.length) {
    const top = outgoing.slice(0, 3).map((p) => `• ${p.payee} · €${p.amount}${p.due ? ` · ${p.due}` : ''}`).join('\n')
    lines.push(`${outgoing.length} te betalen:\n${top}`)
  }
  if (incoming.length) {
    const total = incoming.reduce((a, p) => a + p.amount, 0)
    lines.push(`${incoming.length} nog te ontvangen, samen €${total}.`)
  }
  const fallbackText = lines.join('\n\n')

  const facts = [
    outgoing.length ? `Te betalen (${outgoing.length}): ${outgoing.map((p) => `${p.payee} €${p.amount}${p.due ? ` (${p.due})` : ''}`).join('; ')}` : 'Te betalen: geen',
    incoming.length ? `Te ontvangen (${incoming.length}): ${incoming.map((p) => `${p.payee} €${p.amount}${p.due ? ` (${p.due})` : ''}`).join('; ')}` : 'Te ontvangen: geen',
  ].join('\n')

  const brainText = await askBrain(
    'Je bent HEYRA, de Nederlandse financiële assistent van OSLIFE (zelfstandige met ParkingYou, PRJCT Agency, Buurtkaart). Je krijgt de exacte openstaande betalingen. Schrijf een kort, concreet Nederlands antwoord (max 3 zinnen) dat samenvat wat er open staat en, als iets urgent is (verlopen datum of dicht bij vandaag), dat benoemt. Verzin GEEN bedragen, namen of datums die niet in de gegevens staan. Zet het belangrijkste bedrag of de belangrijkste datum in **vet**.',
    facts,
    { maxTokens: 200 },
  )

  return { text: brainText ?? fallbackText, topic: 'money', fromBrain: !!brainText }
}
