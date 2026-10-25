# Community trust implementation ledger

- Ruling: user approved separate reputation, observed reliability and MET Norway concordance. Weather comparisons and votes must never automatically slash.
- Ruling: Supabase is shared backend persistence; Stellar remains authoritative for listings, stakes and executed sanctions. No registry ABI or contract address changes.
- Ruling: SEP-53 wallet proof, expiring single-use challenges and HttpOnly sessions authorize private reads and mutations. RLS denies direct client access.
- Ruling: one active review per wallet/listing; updates require a newer successful paid call. Old unbound transfers do not grant voting rights. Provider self-review is rejected.
- Ruling: authorized independent moderators review cases. Warning/slash requires provider response or deadline; chain actions require a second signed approval and are executed only with the auditor key.
- Validation: 176 application/SQL/security tests passed, root and web TypeScript checks passed, 21 registry tests passed. Live Supabase/Freighter test remains pending project credentials.
- User instruction: create a local commit now; do not push. Continue live setup after configuration is supplied.
