-- Strategie HQ · Aanpasbare wegingsfactoren — idea-elaborate levert voortaan
-- ook een score-uitsplitsing per dimensie (markt, uitvoerbaarheid, financieel,
-- risico-veiligheid) naast de ene holistische feasibility_score. De UI laat
-- Rick zelf per dimensie een gewicht instellen (client-side voorkeur, niet
-- hier opgeslagen) en berekent daarmee een persoonlijke gewogen score naast
-- de AI-score. Nullable/geen default: bestaande ideeën hebben er geen totdat
-- ze opnieuw worden uitgewerkt.

alter table business_ideas
  add column if not exists score_breakdown jsonb; -- {market, execution, financial, risk} — elk 0-100, hoger = beter/veiliger
