/**
 * OSLIFE Betalingen-sheet reader — part of the standalone "OSLIFE ingest" project.
 * --------------------------------------------------------------------------------
 * Opens your Betalingen Google Sheet BY ID (PAYMENTS_SHEET_ID) and POSTs to
 * payments-sheet-ingest (→ finance_tx). Tailored to the phone card-log export:
 *
 *   Timestamp | Merchant | Amount | Currency | Payment Method | Account Type | Raw Title | Raw Text
 *
 * Card payments are spend → stored negative. Account Type ("Persoonlijk"/"Zakelijk")
 * maps to the app domain. dedup_key (`date|amount`) matches the in-app ABN AMRO
 * CSV import, so a purchase in both sources is stored once.
 *
 * Column names matched case-insensitively (contains). Shared helpers in Code.gs.
 * Trigger: installAllTriggers() installs syncPaymentsSheet (every 30 min).
 */

function syncPaymentsSheet() {
  var url = prop('PAYMENTS_SYNC_URL');
  if (!url) { log('syncPaymentsSheet: PAYMENTS_SYNC_URL not set — skipping'); return; }
  var lock = acquireLock_();
  if (!lock) { log('syncPaymentsSheet: another run in progress — skipping'); return; }
  try {
    var ss = openSheetById_('PAYMENTS_SHEET_ID');
    var sheet = ss.getSheets()[0];
    var d = sheet.getDataRange().getValues();
    if (d.length < 2) { log('syncPaymentsSheet: no rows'); return; }

    var dateC = colIdx_(d[0], ['timestamp', 'datum', 'date']);
    var amtC  = colIdx_(d[0], ['amount', 'bedrag', 'afschrijving']);
    var merC  = colIdx_(d[0], ['merchant', 'omschrijving', 'naam', 'winkel', 'tegenpartij', 'payee'], ['raw']);
    var rawC  = colIdx_(d[0], ['raw title', 'raw text']);
    var domC  = colIdx_(d[0], ['account type', 'rekening', 'soort', 'domein', 'domain']);
    var catC  = colIdx_(d[0], ['categorie', 'category']);
    if (dateC === -1 || amtC === -1) { log('syncPaymentsSheet: Timestamp/Amount column not found'); return; }

    var txns = [];
    for (var i = 1; i < d.length; i++) {
      var date = sheetDate_(d[i][dateC]); if (!date) continue;
      var amount = sheetNumOrNull_(d[i][amtC]); if (amount == null) continue;
      var merchant = merC !== -1 ? String(d[i][merC] || '') : (rawC !== -1 ? String(d[i][rawC] || '') : '');
      txns.push({
        date: date,
        amount: -Math.abs(amount),
        merchant: merchant.slice(0, 200),
        category: catC !== -1 ? String(d[i][catC] || '').toLowerCase() : '',
        domain: payDomain_(domC !== -1 ? d[i][domC] : ''),
      });
    }
    if (!txns.length) { log('syncPaymentsSheet: no usable rows'); return; }

    var CHUNK = 200, total = 0;
    for (var k = 0; k < txns.length; k += CHUNK) {
      var resp = ingestPost_(url, { transactions: txns.slice(k, k + CHUNK) });
      total += (resp && resp.upserted) || 0;
    }
    log('syncPaymentsSheet: ' + txns.length + ' rows (upserted ' + total + ')');
  } finally {
    lock.releaseLock();
  }
}

/** Map "Account Type" / domain text to an app domain. */
function payDomain_(val) {
  var s = String(val || '').toLowerCase();
  if (/zakelijk|business|prjct|zaak/.test(s)) return 'prjct';
  if (/parking|strijp/.test(s)) return 'parkingyou';
  if (/buurtkaart|geldrop/.test(s)) return 'buurtkaart';
  return 'personal'; // persoonlijk / privé / leeg
}
