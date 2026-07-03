// Project templates — auto-inject a standard task breakdown when a project of a
// given type is created, so the "blank project, now what?" gap never happens.
//
// Keyed by the labels in PROJECT_TYPE_OPTIONS (src/components/crm.tsx). A project
// can carry several types; templateTasksFor() returns the deduped union in a
// stable order (first type wins on ties).

/** Standard task list per project type. Types without an entry contribute nothing. */
export const TEMPLATE_TASKS: Record<string, string[]> = {
  Website:    ['Intake & briefing', 'Wireframes', 'Design', 'Development', 'Content vullen', 'Review met klant', 'Launch'],
  Webshop:    ['Intake & briefing', 'Productstructuur', 'Design', 'Development', 'Betaal- & verzendkoppeling', 'Testbestelling', 'Launch'],
  Branding:   ['Intake & merkgesprek', 'Moodboard', 'Concepten', 'Uitwerking', 'Presentatie', 'Merkgids opleveren'],
  Logo:       ['Intake & briefing', 'Schetsen', 'Concepten', 'Uitwerking', 'Presentatie', 'Bestanden aanleveren'],
  'Social Media': ['Strategie & doelen', 'Contentkalender', 'Templates ontwerpen', 'Eerste posts', 'Evaluatie'],
  SEO:        ['Nulmeting & audit', 'Zoekwoordenonderzoek', 'On-page optimalisatie', 'Content', 'Rapportage'],
  Content:    ['Intake & tone-of-voice', 'Contentplan', 'Schrijven', 'Review', 'Opleveren'],
  Fotografie: ['Intake & shotlist', 'Locatie & planning', 'Shoot', 'Selectie', 'Nabewerking', 'Aanleveren'],
  Video:      ['Intake & concept', 'Script', 'Draaidag', 'Montage', 'Review', 'Aanleveren'],
  Advies:     ['Intake & vraagstelling', 'Onderzoek', 'Analyse', 'Adviesrapport', 'Presentatie'],
  Onderhoud:  ['Back-up controleren', 'Updates draaien', 'Check & test', 'Rapportage'],
  App:        ['Intake & briefing', 'Wireframes', 'Design', 'Development', 'Testen', 'Store-oplevering'],
}

/** Deduped union of the template tasks for the given project types (order-stable). */
export function templateTasksFor(types: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const type of types) {
    for (const task of TEMPLATE_TASKS[type] ?? []) {
      if (!seen.has(task)) {
        seen.add(task)
        out.push(task)
      }
    }
  }
  return out
}
