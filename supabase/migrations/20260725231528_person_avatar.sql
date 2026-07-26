-- OSLIFE · Relaties — profielfoto-veld, gevuld door fetch-instagram-profile
-- (of handmatig) zodat de rolodex een echte foto kan tonen i.p.v. initialen.
alter table person add column if not exists avatar_url text;
