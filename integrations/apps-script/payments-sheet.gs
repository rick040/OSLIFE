/**
 * OSLIFE Betalingen-sheet reader — part of the standalone "OSLIFE ingest" project.
 * --------------------------------------------------------------------------------
 * Opens your Betalingen Google Sheet BY ID (Script Property PAYMENTS_SHEET_ID),
 * reads the card-payment rows and POSTs them to the payments-sheet-ingest edge
 * function (→ finance_tx). Leave the script that fills the sheet untouched.
 *
 * These rows share a dedup_key (`date|amount`) with the in-app ABN AMRO CSV
 * import, so a purchase in BOTH the sheet and the monthly ABN export is stored
 * only once.
 *
 * Columns (header row, matched case-insensitively; order/extra columns don't matter):
 *   Datum|Date  ·  Bedrag|Amount  ·  Omschrijving|Merchant|Naam|Winkel  ·  Categorie|Category  ·  Domein|Domain
 *
 * Trigger: installAllTriggers() in Code.gs installs syncPaymentsSheet (every 30 min).
 * Shared helpers live in Code.gs.
 */

var PAY_ALIASES = {
  date:     ["datum", "date", "transactiedatum", "boekdatum"],
  amount:   ["bedrag", "amount", "value", "afschrijving"],
  merchant: ["omschrijving", "merchant", "naam", "winkel", "tegenpartij", "description", "payee"],
  category: ["categorie", "category"],
  domain:   ["domein", "domain"],
};

function syncPaymentsSheet() {
  var url = prop('PAYMENTS_SYNC_URL');
  if (!url) { log('syncPaymentsSheet: PAYMENTS_SYNC_URL not set — skipping'); return; }
  var lock = acquireLock_();
  if (!lock) { log('syncPaymentsSheet: another run in progress — skipping'); return; }
  try {
    var ss = openSheetById_('PAYMENTS_SHEET_ID');
    var sheet = ss.getSheets()[0];
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) { log('syncPaymentsSheet: no rows'); return; }

    var idx = {};
    for (var f in PAY_ALIASES) idx[f] = headerIndex_(data[0], PAY_ALIASES[f]);
    if (idx.date == null || idx.amount == null) { log('syncPaymentsSheet: Date/Amount column not found'); return; }

    var txns = [];
    for (var i = 1; i < data.length; i++) {
      var date = sheetDate_(data[i][idx.date]);
      if (!date) continue;
      var amount = sheetNumOrNull_(data[i][idx.amount]);
      if (amount == null) continue;
      txns.push({
        date: date,
        amount: -Math.abs(amount), // card payments are spend → negative
        merchant: idx.merchant != null ? String(data[i][idx.merchant] || '').slice(0, 200) : '',
        category: idx.category != null ? String(data[i][idx.category] || '').toLowerCase() : '',
        domain: idx.domain != null ? String(data[i][idx.domain] || '').toLowerCase() : '',
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
