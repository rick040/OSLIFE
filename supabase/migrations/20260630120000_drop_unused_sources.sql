-- Drop data sources that OSLIFE no longer uses.
-- Music (Spotify) and Location (Google Maps) were removed because they are not
-- among the app's real data sources. Both tables are empty; the matching
-- frontend slices, fetchers and ingestion scripts were removed in the same change.

-- DROP TABLE automatically removes the table from supabase_realtime, so no
-- explicit ALTER PUBLICATION is needed.
drop table if exists spotify_history;
drop table if exists location_visits;
