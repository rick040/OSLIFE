-- wallet-ingest's inferCategory() briefly scanned the FULL raw bank-notification
-- text for Rick's own IBAN (checking/savings) as an "internal transfer" signal.
-- Every ABN debit notification mentions the SOURCE account being debited —
-- which is always one of those same two IBANs — so this self-matched on every
-- single generic "bedrag afgeschreven" alert, mislabeling all of them as
-- Internal transfer regardless of the real merchant. Fixed in code (wallet-ingest
-- now only checks the merchant field itself); this backfills the rows that were
-- already written with the bug live.
--
-- Scope: only rows still carrying the "no merchant yet" placeholder AND tagged
-- Internal transfer by that ingest path (not `abn_csv`, which never had this
-- bug and may have already correctly confirmed a real transfer for the same
-- placeholder row). Reset to 'Other' so the auto-tagger / a later Wallet
-- enrichment / CSV import can (re)classify them correctly instead of leaving
-- the wrong verdict in place.
update finance_tx
set category = 'Other'
where counterparty = 'Onbekend (bank-melding)'
  and category = 'Internal transfer'
  and source <> 'abn_csv';
