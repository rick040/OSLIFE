// Strategie HQ export: turn a business idea (elaboration + the opt-in
// customer-analysis/MVP-plan pipelines, which live outside idea.markdown)
// into one Markdown document, downloadable as-is or printed to PDF via the
// browser's native print dialog — no new dependency for either.
import type { BusinessIdea, CustomerAnalysis, MvpPlan } from '../types'

function customerAnalysisMarkdown(ca: CustomerAnalysis | null): string {
  if (!ca) return ''
  const lines: string[] = ['## Klantanalyse & Persona\'s', '', ca.targetMarket]
  if (ca.marketInsight) lines.push('', `**Markttiming:** ${ca.marketInsight}`)
  if (ca.personas.length) {
    lines.push('', '### Persona\'s')
    for (const p of ca.personas) {
      lines.push('', `#### ${p.name} — ${p.role}${p.ageRange ? ` (${p.ageRange})` : ''}`)
      if (p.quote) lines.push(`> "${p.quote}"`)
      lines.push('', p.situation)
      if (p.goals.length) lines.push('', '**Doelen:**', ...p.goals.map((g) => `- ${g}`))
      if (p.painPoints.length) lines.push('', '**Frustraties:**', ...p.painPoints.map((g) => `- ${g}`))
      if (p.triggers.length) lines.push('', '**Triggers:**', ...p.triggers.map((g) => `- ${g}`))
      if (p.objections.length) lines.push('', '**Bezwaren:**', ...p.objections.map((g) => `- ${g}`))
      if (p.whereToFind.length) lines.push('', `**Vindplekken:** ${p.whereToFind.join(', ')}`)
    }
  }
  if (ca.competitors.length) {
    lines.push('', '### Concurrentie & alternatieven')
    for (const c of ca.competitors) {
      lines.push(`- **${c.name}** — ${c.description}${c.strength ? ` (sterk: ${c.strength})` : ''}${c.weakness ? ` (kans: ${c.weakness})` : ''}`)
    }
  }
  if (ca.positioning) lines.push('', '### Positionering', ca.positioning)
  if (ca.pricingSuggestion) lines.push('', '### Prijsadvies', ca.pricingSuggestion)
  return lines.join('\n')
}

function mvpPlanMarkdown(mp: MvpPlan | null): string {
  if (!mp) return ''
  const lines: string[] = ['## MVP Launch Plan', '', `**Hypothese:** ${mp.hypothesis}`]
  if (mp.riskiestAssumption) lines.push('', `**Grootste risico-aanname:** ${mp.riskiestAssumption}`)
  if (mp.targetCustomer) lines.push('', `**Eerste doelgroep:** ${mp.targetCustomer}`)
  if (mp.channels.length) {
    lines.push('', '### Kanalen')
    for (const c of mp.channels) lines.push(`- **${c.name}** (${c.effort}, ${c.cost}) — ${c.why}`)
  }
  if (mp.experiments.length) {
    lines.push('', '### Experimenten')
    for (const e of mp.experiments) lines.push(`- **${e.title}** — ${e.description} (${e.timeframe}, signaal: ${e.successSignal})`)
  }
  if (mp.roadmap.length) {
    lines.push('', '### Roadmap')
    for (const phase of mp.roadmap) {
      lines.push(`- **${phase.phase}** — ${phase.goal}`)
      for (const t of phase.tasks) lines.push(`  - [${t.done ? 'x' : ' '}] ${t.title}`)
    }
  }
  if (mp.signalsToWatch.length) lines.push('', '### Signalen om bij te houden', ...mp.signalsToWatch.map((s) => `- ${s}`))
  return lines.join('\n')
}

/** Full document: the elaboration write-up plus, if generated, the customer analysis and MVP plan. */
export function buildIdeaMarkdown(idea: BusinessIdea): string {
  const base = idea.markdown?.trim() || `# ${idea.title}\n\n${idea.overview ?? ''}`
  const extra = [customerAnalysisMarkdown(idea.customerAnalysis), mvpPlanMarkdown(idea.mvpPlan)].filter(Boolean)
  return [base, ...extra].join('\n\n---\n\n')
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || 'idee'
  )
}

export function downloadIdeaMarkdown(idea: BusinessIdea): void {
  const md = buildIdeaMarkdown(idea)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(idea.title)}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineHtml(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

/** Tiny Markdown → HTML pass, just enough for the shapes buildIdeaMarkdown emits. Not a general-purpose renderer. */
function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  const closeList = () => {
    if (inList) { out.push('</ul>'); inList = false }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^###\s+/.test(line)) { closeList(); out.push(`<h4>${inlineHtml(line.replace(/^###\s+/, ''))}</h4>`) }
    else if (/^##\s+/.test(line)) { closeList(); out.push(`<h3>${inlineHtml(line.replace(/^##\s+/, ''))}</h3>`) }
    else if (/^#\s+/.test(line)) { closeList(); out.push(`<h2>${inlineHtml(line.replace(/^#\s+/, ''))}</h2>`) }
    else if (/^>\s?/.test(line)) { closeList(); out.push(`<blockquote>${inlineHtml(line.replace(/^>\s?/, ''))}</blockquote>`) }
    else if (/^-\s+\[[ xX]\]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      const checked = /\[[xX]\]/.test(line)
      out.push(`<li>${checked ? '☑' : '☐'} ${inlineHtml(line.replace(/^-\s+\[[ xX]\]\s+/, ''))}</li>`)
    }
    else if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inlineHtml(line.replace(/^[-*]\s+/, ''))}</li>`)
    }
    else if (line === '---') { closeList(); out.push('<hr/>') }
    else if (line.trim() === '') { closeList() }
    else { closeList(); out.push(`<p>${inlineHtml(line)}</p>`) }
  }
  closeList()
  return out.join('\n')
}

export function buildIdeaPrintableHtml(idea: BusinessIdea): string {
  const body = markdownToHtml(buildIdeaMarkdown(idea))
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(idea.title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.5; }
  h1 { font-size: 26px; }
  h2 { font-size: 20px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 16px; margin-top: 20px; }
  h4 { font-size: 14px; margin-top: 14px; margin-bottom: 4px; }
  p { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 22px; }
  li { margin: 2px 0; }
  blockquote { margin: 8px 0; padding: 8px 12px; background: #f5f5f5; border-left: 3px solid #999; font-style: italic; }
  hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
  @media print { body { margin: 0; padding: 16px; } }
</style>
</head>
<body>
<h1>${escapeHtml(idea.title)}</h1>
${body}
</body>
</html>`
}

/** Opens a new tab with a printable version of the idea and triggers the browser's print dialog — "Save as PDF" from there produces the export. */
export function printIdeaAsPdf(idea: BusinessIdea): void {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.open()
  win.document.write(buildIdeaPrintableHtml(idea))
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 200)
}
