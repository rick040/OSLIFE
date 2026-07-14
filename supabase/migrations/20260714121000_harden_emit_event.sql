-- OSLIFE · Slice 0 hardening — pin het search_path van emit_event().
--
-- De database-linter markeert functies zonder vast search_path (0011). emit_event
-- verwijst al volledig schema-gekwalificeerd naar public.events / public.type_registry
-- en gebruikt verder alleen pg_catalog-builtins (to_jsonb, coalesce, now), dus een
-- leeg search_path is veilig en sluit de waarschuwing.
alter function public.emit_event() set search_path = '';
