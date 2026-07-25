# Telegram → Tasker/MacroDroid — automation tags

Elk proactief bericht dat `notify-tick` naar de OSLIFE-bot stuurt eindigt
voortaan met een verborgen, machine-leesbare regel — een "tag" — na de
leesbare tekst. Tasker of MacroDroid kan die tag uit het Telegram-bericht
plukken en er een actie op je telefoon aan hangen (wekker zetten, DND
aanzetten, een app openen, …), zonder dat het bericht dat je zelf leest
verandert.

Dit is de spiegelbeeld-richting van de andere bestanden in deze map
(`app-timer.md`, `bank-notifications.md`, …), die allemaal telefoon → OSLIFE
gaan. Hier gaat het OSLIFE → telefoon.

## Het formaat

Elk getagd bericht ziet er zo uit:

```
💊 Tijd voor Ibuprofen (400mg).

##OSLIFE##{"type":"medication_reminder","id":"…","name":"Ibuprofen","dosage":"400mg","time":"08:00"}
```

- De tag staat altijd op een eigen regel, gescheiden door een lege regel van
  de leesbare tekst.
- `##OSLIFE##` is de vaste prefix; alles erna is één regel geldige JSON.
- `type` komt exact overeen met de `kind` die OSLIFE intern gebruikt voor
  dedup (zie `notification_log.kind` in
  `supabase/migrations/20260701150000_notifications.sql`) — je kunt dus op
  hetzelfde woord filteren dat ook in de Supabase-logs staat.
- De overige velden verschillen per `type` (zie tabel hieronder).

## `type` → velden

| `type` | Velden | Wanneer |
|---|---|---|
| `morning` | `blocks: [{start, end, title, blockType}]` | Ochtendbriefing — vandaags agenda uit `day_blocks` |
| `evening_checkin` | *(geen)* | Avond check-in vraag |
| `habit_reminder` | `habits: [{id, name, icon, streak}]` | Nog openstaande gewoontes |
| `inference_digest` | `count` | Batch afleidingen ter bevestiging |
| `medication_reminder` | `id, name, dosage, time` | Medicatie-tijdstip bereikt |
| `urgent_payment` | `id, payee, amount, due, daysLeft` | Betaling te laat / binnen 3 dagen |
| `urgent_thread` | `id, title, owedTo, daysOverdue` | Open loop te laat |
| `urgent_project_blocked` | `id, name` | Project geblokkeerd |
| `urgent_invoice_overdue` | `id, number, amount, due` | Factuur te laat |
| `urgent_followup` | `id, name, email, daysSince` | Klant-follow-up verlopen |

`evening_checkin` heeft geen extra velden omdat er geen gestructureerde
tijd/locatie aan hangt — je kunt op `type` alleen filteren om bijvoorbeeld
altijd DND aan te zetten tijdens de avond-check-in.

## Twee uitgewerkte voorbeelden

**Ochtendbriefing → DND tijdens agendablokken.** `blocks` is de rauwe
`day_blocks`-rij voor vandaag (`start`/`end` als `HH:MM`, `blockType` zoals
`work`/`meeting`/`personal`). In Tasker: **For-loop** over `%blocks` (Tasker's
JSON-array-iteratie, of `%blocks()` na een Parse JSON-actie), en per item met
`blockType != "personal"` een **Time**-conditie plus **DND → Priority only**
tussen `start` en `end` inplannen. Zo hoef je nooit meer zelf DND aan te
zetten voor een call.

**Verlopen follow-up → contact direct openen.** `email` is het e-mailadres
uit de CRM-klantkaart (`clients.email`, kan `null` zijn als het ontbreekt).
In MacroDroid: **If** `%email` is niet leeg → **Compose Email** action met
`%email` als ontvanger en een vaste onderwerpregel (`"Follow-up: %name"`), zo
sta je één tik verwijderd van het bericht in plaats van alleen een
herinnering te krijgen.

## Tasker — profiel + regex

1. **Trigger**: Event → Plugin → een Telegram-plugin die reageert op nieuwe
   berichten in je bot-chat (bv. "Telegram Bot" van Joao Dias), of een HTTP
   Request-trigger als je zelf op `getUpdates` pollt.
2. **Task**:
   - **Variable Search Replace** of **JavaScript** op de inkomende tekst met
     regex `##OSLIFE##(\{.*\})` → capture group 1 in bv. `%tag_json`.
   - Als er geen match is: stop de task (het was een gewoon bericht, geen
     getagde nudge).
   - **Parse JSON** (Tasker's ingebouwde JSON-acties, of de "JavaScriptlet"
     action met `JSON.parse(local('tag_json'))`) om `type` en de overige
     velden uit te lezen.
   - **Switch/If op `%type`** → route naar de actie die bij dat type hoort,
     bv.:
     - `medication_reminder` → **Alarm → Set Alarm** met `%time` en label
       `"%name (%dosage)"`.
     - `urgent_payment` → **App → Launch App** (je bank-app) of een
       notificatie met hogere prioriteit.
     - `evening_checkin` → **DND → Priority only** voor het komende uur.

Eén profiel met deze regex-trigger + JSON-parse + switch-op-`type` dekt alle
huidige en toekomstige tag-types — een nieuw `type` toevoegen in
`notify-tick` vraagt geen nieuw Tasker-profiel, alleen een nieuwe `case` in
de bestaande switch.

## MacroDroid — trigger + parse

1. **Trigger**: "Telegram Message Received" (als je die trigger-plugin hebt)
   of anders dezelfde polling-aanpak als Tasker hierboven.
2. **Actions**:
   - **Regex** op het bericht met `##OSLIFE##(\{.*\})` → lokale variabele.
   - **Parse JSON** action → variabelen `type`, `time`, `name`, …
   - **If/Then** blok per `type`, met dezelfde routing als bij Tasker
     hierboven (Set Alarm, Do Not Disturb, Open App, …).

## Nieuwe tag-types toevoegen

Een nieuw `type` toevoegen is puur server-side: roep
`withAutomationTag(text, kind, payload)` uit
`supabase/functions/_shared/telegram.ts` aan op de plek waar je het bericht
verstuurt, met `kind` als `type` en een plat object met de velden die de
automatie nodig heeft. Vermijd geneste objecten/arrays waar het kan — hoe
platter de payload, hoe makkelijker de Tasker/MacroDroid JSON-parse-actie
'm uit elkaar trekt.
