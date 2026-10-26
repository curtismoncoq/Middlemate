# Implementation plan: community trust

- [x] Versioned Supabase migration, namespace isolation, RLS, transactional eligibility and moderation locks.
- [x] Shared database client, wallet signature verification and verified settlement receipts.
- [x] Disable weather automatic slash; retain LLM enforcement; persist and migrate audits.
- [x] Wallet login, invocation gateway, public reputation and authorized community endpoints.
- [x] Buyer/provider workspace, review/report flows and moderator decisions with wallet confirmation.
- [x] Setup/migration/check commands, README limits and exact Supabase walkthrough.
- [x] SQL behavior/security tests, application tests, TypeScript and registry checks.
- [x] Live Supabase API smoke test: wallet signatures, sessions, reviews, private reports, moderation RPCs and existing Stellar payment receipt; disposable test data cleaned up.
- [ ] Manual Freighter/browser walkthrough by the user (new paid call, review, report and provider response).

- [x] Dashboard selectors, compact catalog cards and persistent provider notification acknowledgement migration.
- [ ] Apply acknowledgement migration to the shared Supabase project and verify real read persistence.
