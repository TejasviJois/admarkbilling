-- =============================================================================
-- Additive only: guarantee unique invoice numbers on live public.invoices.
-- Safe to re-run. Does not DROP, TRUNCATE, or rewrite existing rows.
-- Prerequisite: no duplicate payload->>'number' values (verified 2026-07-19).
-- =============================================================================

create unique index if not exists invoices_payload_number_uidx
  on public.invoices ((payload->>'number'))
  where nullif(btrim(payload->>'number'), '') is not null;
