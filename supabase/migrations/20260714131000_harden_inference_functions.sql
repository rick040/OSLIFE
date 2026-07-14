-- OSLIFE · Slice 1 hardening — beperk wie de SECURITY DEFINER-functies mag aanroepen.
--
-- De linter (0028/0029) markeerde dat run_inference en confirm_inference via
-- /rest/v1/rpc aanroepbaar waren door anon/authenticated. run_inference hoort
-- alleen door pg_cron (owner) gedraaid te worden. confirm_inference mag door een
-- ingelogde gebruiker (met eigenaarscheck) en de service-role (Telegram-webhook),
-- maar NIET door anon: anon heeft auth.uid() = null en zou anders in de
-- "vertrouwde server"-tak vallen en elke inferentie kunnen bevestigen.

revoke execute on function public.run_inference() from public, anon, authenticated;

revoke execute on function public.confirm_inference(uuid, text) from public, anon;
grant  execute on function public.confirm_inference(uuid, text) to authenticated, service_role;
