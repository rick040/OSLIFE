-- OSLIFE · Slice 4 hardening — beperk RPC-uitvoerrechten (linter 0028/0029).
--
-- rule_suppressed en suppress_muted_inferences zijn interne helpers (aangeroepen
-- door de trigger / definer-functies) en horen niet via REST bereikbaar te zijn.
-- forget mag door een ingelogde eigenaar (eigen check) en de service-role, maar
-- NIET door anon: anon heeft auth.uid() = null en zou anders in de "vertrouwde
-- server"-tak vallen en willekeurige records kunnen wissen.

revoke execute on function public.rule_suppressed(uuid, text) from public, anon, authenticated;
revoke execute on function public.suppress_muted_inferences() from public, anon, authenticated;

revoke execute on function public.forget(text, uuid) from public, anon;
grant  execute on function public.forget(text, uuid) to authenticated, service_role;
