# UMEED — Community Support Platform

UMEED connects people seeking support with NGOs and volunteers. The existing Next.js frontend is being migrated incrementally to a Node.js, Express, TypeScript, MongoDB, and Mongoose backend.

## Current migration boundary

The Express backend provides MongoDB-backed authentication, support-request APIs, verification queues, emergency records, anonymous chat, volunteer opportunities and directory, NGO directory, notifications, audit history, and aggregate impact statistics. Same-origin Next.js route handlers proxy all frontend API paths to Express; no Next.js API handler reads the legacy JSON-backed store. The visual design remains in place. `data/db.json` has not been read, copied, or migrated by the new backend.

## Local setup

Install both applications:

```powershell
npm ci
npm --prefix server ci
```

Create `.env.local` from `.env.example`. Set distinct, randomly generated values of at least 32 bytes for `JWT_SECRET` and `SESSION_SECRET`; both are mandatory. Configure a dedicated MongoDB database and set `API_INTERNAL_URL` to the Express API URL. Never commit `.env.local`, database contents, or backups.

Start a reachable MongoDB instance, then start the backend and frontend in separate terminals:

```powershell
npm run backend:dev
npm run dev
```

The frontend is served at `http://localhost:3000`; Express defaults to port `4000`. The Next.js `/api/auth/*` routes proxy to Express and return an explicit service error when `API_INTERNAL_URL` is unset or unavailable; they do not fall back to JSON-file authentication.

The backend requires MongoDB at startup. Request mutations, verification decisions, and emergency record modifications write their audit events transactionally, so the MongoDB deployment must support transactions (a replica set or sharded cluster). `/api/v1/health/live` reports process liveness and `/api/v1/health/ready` reports database readiness.

## Persistent fictional staging

For isolated browser validation on a developer machine, build the backend and run:

```powershell
npm run backend:build
npm --prefix server run staging:local
```

This starts a one-node MongoDB 7.0.14 replica set bound only to `127.0.0.1`, using WiredTiger files under `server/.local-staging-data/`, plus the Express API and Next.js frontend on ports `4100` and `3100`. It seeds fictional accounts, support requests, an opportunity, and notifications idempotently; it skips existing fixture records rather than overwriting them. The console prints the fixture sign-in details; they are for local testing only. Stop with Ctrl+C; MongoDB files are intentionally preserved so the staging database survives a service restart. The script refuses to reuse an unmarked existing directory and never reads `data/db.json`.

To reset only this fictional local database, stop the staging process, move the exact `server/.local-staging-data/member` directory to a dated archive name under `server/.local-staging-data/`, then rerun the staging command. This keeps the marker and archived data while the script creates a fresh member database. Never use this procedure on a managed staging or production database.

This local harness is **not** a production-like managed staging service: it is unauthenticated MongoDB bound to loopback and must never be exposed to a network, reused with real information, or deployed. For shared staging, provision a dedicated persistent MongoDB replica set with TLS, authentication, a least-privilege app user, network allowlisting, encrypted backups, and isolated credentials. Keep staging and production secrets/databases separate. The local fixture database has no automated data deletion; inspect and archive only its explicitly named `.local-staging-data` directory when retiring it.

## Authentication and account provisioning

- Public registration accepts only seeker, NGO, and volunteer roles.
- Verified NGOs can publish validated volunteer opportunities; the creator reference is stored privately and is not included in public opportunity responses.
- Verified NGO owners can view and accept applications only for opportunities they created. Applicant contact details are not returned; acceptance writes a volunteer notification and an audit event.
- Admin users can only be created through the interactive operator command `npm --prefix server run admin:provision`. It refuses to overwrite an account and does not accept a role from a request.
- To add an Admin to the persistent local staging database, start the staging services as described above, then run `npm --prefix server run admin:provision` in a second PowerShell terminal. The ignored `.env.local` must point to `mongodb://127.0.0.1:27117/?replicaSet=umeedPhase71Stage` and database `umeed_phase71_staging`; use separate random values of at least 32 bytes for `JWT_SECRET` and `SESSION_SECRET`. The command prompts for name and email, then prompts twice for a hidden password (12–128 characters). It creates an additional Admin and refuses duplicate email addresses; it does not replace existing accounts. Production-mode provisioning is disabled.
- Authentication uses a random HttpOnly, SameSite session cookie backed by MongoDB. Session records store only a keyed hash of the cookie token, expire after eight hours, and are checked for revocation and expiry on every authenticated request.
- State-changing authentication operations require the configured frontend `Origin` and a session-bound CSRF token.
- `JWT_SECRET` signs short-lived compatibility tokens held in browser memory only, so the existing Next.js resource API calls can continue during migration. The Express session cookie remains the authority for Express authentication.
- No seeded user from `data/db.json` has been migrated. Existing seeded logins will not work against MongoDB until a separately approved data migration.
- The dashboard uses the role from the authenticated MongoDB session, not the URL. Expired sessions clear frontend auth state; pending NGO/volunteer accounts cannot self-approve.
- Admins can review pending NGO and volunteer applications. Public directories include verified profiles only and omit private contact fields.
- Admins can review a bounded, sanitized audit-event list; event details/payloads are excluded from the API response.
- Admins can review active emergency records and assign verified responders. Each list/read and responder authorization is audited; emergency records remain limited to the owner, Admins, or explicitly authorized verified responders.
- Opportunity applications require a verified volunteer and are duplicate-safe. Public responses expose counts; only the verified NGO that owns an opportunity can view its applicants or accept an application. Applicant contact details are excluded.

In production, create the declared indexes before starting the API:

```powershell
npm --prefix server run db:indexes
```

The index command creates missing indexes without dropping unrelated indexes. Resolve any duplicate email records before creating the unique email index.

## Support requests and verification

- Seeker request reads and updates are scoped to the authenticated seeker's MongoDB user ID. Only eligible requests can be edited or cancelled; request status transitions are validated server-side.
- Verified NGOs can see assigned requests and unassigned requests matching their operating city and support categories. An NGO can assign an eligible request to itself and manage only its own assignments.
- Volunteers can read only requests assigned to them and cannot change request state. Assignment targets must be verified users.
- Admin request access and request assignment/status changes are audited. NGO and volunteer verification is restricted to Admin sessions; decisions are validated and audited.
- Request lists and details omit seeker identity, contact, locality, and notes except for the seeker, an Admin, or a request's assigned coordinator.
- Conditional MongoDB updates enforce ownership/assignment and current status in the update query, preventing stale concurrent writes from overriding newer state.
- The temporary MongoDB replica-set test fixture uses fictional user and request data only.

## Private features

- Emergency records require explicit consent, contain only coordinates/accuracy and ownership metadata, and expire after 24 hours. Signed-in owners and anonymous owners with an HttpOnly, random capability cookie can access their records. Admins can read records; only Admins can assign verified NGO/volunteer responders. Responders see rounded coordinates without accuracy, and sensitive access/modifications are audited. UMEED records location only; it does not contact or dispatch emergency services.
- Anonymous chat history is bound to an HttpOnly, unguessable, 24-hour credential cookie. Client-supplied session IDs and recipient filters are rejected. Histories are bounded and expire automatically. The assistant is rule-based, not AI-powered.
- The public volunteer directory queries verified accounts only and returns a fixed public projection. Contact details, locality, motivation, verification state, and credentials are excluded. Volunteer profile updates require the authenticated volunteer session.
- Notification reads and updates are scoped by the authenticated recipient in MongoDB queries; request bodies and query strings cannot select another user.
- No personal records have been imported from the legacy JSON store. The MongoDB feature schemas and indexes must be deployed before enabling these routes.
- Precise emergency coordinates are no longer embedded in a third-party map iframe; opening an external map link is user initiated.
- Emergency record owners can delete their private record before its 24-hour expiry. The UI shows the expiry and confirms location persistence only after the backend save succeeds.
- Chat history can be cleared through an ownership-credential-scoped backend operation. Errors are shown explicitly rather than replaced with fake success replies.

## Phase 6: controlled JSON migration

The importer reads an operator-supplied backup read-only. It defaults to a dry run, never prints record values or exception messages, and refuses to use the active `data/db.json` path. Dry-run reports only collection totals, import totals, rejection categories, and a SHA-256 digest. It does not connect to MongoDB.

The previous private backup was verified byte-for-byte against the source before the dry run. The current dry-run result for that backup was:

| Collection | Source | Planned import |
|---|---:|---:|
| Users | 6 | 2 |
| Requests | 4 | 0 |
| Volunteer opportunities | 4 | 4 |
| Emergency records | 1 | 0 |
| Chat messages | 3 | 0 |
| Notifications | 4 | 1 |

Expected exclusions: 1 Admin account (never imported), 3 seed/demo-pattern accounts held for explicit review, 7 dependent requests/notifications referencing excluded users, 1 emergency record without owner-bound consent, and 3 shared/unowned chat messages. There were no duplicate email groups, duplicate IDs, invalid references, invalid records, or incompatible password formats in this snapshot. No target database was connected or counted by this dry run.

The importer maps old identifiers to `legacyId` and maps relationships to MongoDB `ObjectId` references. A source ID that is already a valid ObjectId is retained as MongoDB `_id`; other IDs remain available as `legacyId`. It preserves scrypt password hashes only when their salt/hash shape matches the existing 16-byte-salt/64-byte-key scrypt implementation. The migration tests verify actual login through the current auth route with fictional data. Admin accounts and known seed-ID-pattern accounts are excluded. It never grants Admin role or silently changes an account's role/status.

Legacy emergency records are excluded because they lack verified owner-bound consent and the new required owner credential/retention. Legacy chat messages are excluded because the old shared session ID cannot establish ownership. Notifications are attached to the imported recipient and their message text is replaced with generic text to avoid importing private details. Dependent records are excluded if their owner or assignee is excluded. Import is blocked for invalid records, duplicate normalized emails/IDs, incompatible password formats, or broken/wrong-role references.

## Deployment and release checklist

The application has not been deployed or cut over. Use a separate staging MongoDB database and fictional data first; do not point staging or local development at production.

1. Provision a MongoDB replica set or sharded cluster with TLS, least-privilege application credentials, backups, and a database name reserved for this environment. Transactions are required.
2. Set the Express environment (`NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB_NAME`, `SESSION_SECRET`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `PORT`, `TRUST_PROXY`, `LOG_LEVEL`, and `API_RATE_LIMIT_MAX`) in the deployment secret manager. Generate distinct random secrets of at least 32 bytes; never put real credentials in Git, build logs, or issue reports.
3. Set the Next.js server environment `API_INTERNAL_URL` to the private HTTPS Express origin. Do not expose the database URI or backend credentials to `NEXT_PUBLIC_*` variables. In production, the frontend origin and backend URL must use HTTPS.
4. Restrict backend network ingress to the frontend service and trusted health-check sources. Configure `FRONTEND_ORIGIN` to the exact browser origin and set `TRUST_PROXY` only to the actual trusted reverse-proxy hop count. The Express API applies Helmet, exact-origin credentialed CORS, CSRF checks on mutations, login/registration throttles, and a configurable API rate limit.
5. Run `npm ci` and `npm --prefix server ci`, then `npm run backend:build`, `npm run build`, `npx tsc --noEmit`, and both test suites. Run all dependency audits and resolve new advisories before release.
6. Run `npm --prefix server run db:indexes` against the designated staging database, then verify `/api/v1/health/live`, `/api/v1/health/ready`, and the frontend `/api/health` proxy. Provision the first Admin interactively with `npm --prefix server run admin:provision`; never use a public registration route for Admin creation.
7. Exercise seeker, NGO, volunteer, and Admin workflows using fictional staging fixtures. Review audit events, cookie flags, CORS, CSRF denial, rate-limit responses, and private-data projections before any production decision.

Use the platform's secret manager for production values. `.env.example` contains local-only placeholders and must not be copied unchanged into production. Production startup rejects MongoDB URIs without TLS enabled (`tls=true`/`ssl=true` for standard URIs; `mongodb+srv` uses TLS by default unless explicitly disabled). A request-scoped nonce Content Security Policy is applied by Next middleware; inline style attributes remain permitted for the current design, so eliminate those before tightening `style-src`. Sensitive feature routes have dedicated per-process rate limits in addition to the API-wide limit; multi-instance deployments need a shared rate-limit store. Configure production monitoring, operational access review, backup/restore drills, shared rate-limit storage, and a separately approved data migration/cutover before release.

Run another dry run only against a verified backup:

```powershell
npm --prefix server run migration:json -- --source 'C:\path\to\private-backup\db.json'
```

Applying is intentionally guarded by an exact backup digest, an explicit confirmation, `MIGRATION_TARGET=non-production`, and a target database name ending in `_migration`, `_staging`, `_test`, or `_dev`. Configure the normal backend environment variables in the process environment; do not put them in command arguments. Apply only to a disposable, isolated non-production clone after reviewing the aggregate dry-run report:

```powershell
npm --prefix server run migration:json -- --source 'C:\path\to\private-backup\db.json' --apply --expected-sha256 '<verified SHA-256>' --confirm-nonproduction
```

All collection writes run in one MongoDB transaction. Every imported document stores its source ID and source-record digest. Reruns with identical records are no-ops; an existing unrelated record or a changed source record is a conflict and aborts the transaction without overwriting target data. Create indexes before operation; the importer creates only its declared indexes and does not drop existing indexes.

### Controlled cutover and rollback

1. Keep the original JSON file read-only and preserve the verified private backup separately. Record backup digest, size, and aggregate dry-run report in the approved operations record; never put the backup or report with private values in Git.
2. Freeze writes to the legacy application, make and verify a fresh encrypted backup, and repeat the dry run against that backup. Review all exclusions, especially seed accounts, Admin account, dependent requests/notifications, and unowned emergency/chat records. Resolve excluded user identities or leave their dependent data unmigrated; do not guess owners.
3. Restore a database snapshot into an isolated non-production MongoDB replica set. Run the guarded apply there and verify only aggregate source/target counts, foreign-key mappings, sample logins using approved test accounts, request visibility, directory projections, and notification ownership. Confirm logs contain no personal fields. Rehearse rollback.
4. For a future approved cutover, schedule a write freeze, take a final verified JSON backup and pre-migration MongoDB snapshot, run the exact-hash apply against the designated production target only after separate authorization, then perform read-only smoke tests before enabling frontend writes. This Phase 6 did not perform these steps.
5. If any apply or smoke test fails, keep writes frozen and route traffic back to the legacy service only if it is still known-safe. Otherwise restore the pre-migration MongoDB snapshot and keep the JSON source untouched. Do not attempt ad-hoc deletion of imported rows; restore the known pre-migration snapshot to avoid deleting or altering unrelated data. Reconcile writes before reopening service.

No live target was selected, no data was applied, and this phase is not a cutover authorization. `data/db.json` and its private backup remain separate from version control.

## Tests and builds

```powershell
npm test
npm run build
npm run backend:build
npm run backend:test
```

Backend integration tests use `mongodb-memory-server`, an isolated temporary MongoDB instance, and fictional fixtures. The first run downloads a MongoDB test binary into the local package cache; tests do not connect to `data/db.json` or a configured production database.

## Architecture

- `server/src/models/` contains strict Mongoose user, session, support-request, private-feature, and audit-event schemas with access-scope indexes.
- `server/src/auth/` contains validation, password hashing, session lifecycle, CSRF, role middleware, and rate-limited auth routes.
- `server/src/requests/routes.ts` provides ownership-scoped support-request and Admin-only verification endpoints.
- `server/src/private-features/routes.ts` provides scoped emergency, chat, volunteer, and notification endpoints.
- `server/src/migration/legacy-json.ts` validates and maps supported legacy records and applies them idempotently in one transaction.
- `server/scripts/migrate-legacy-json.ts` is the dry-run-first CLI importer; it does not connect to MongoDB in dry-run mode.
- `lib/server/api-proxy.ts` forwards the existing feature URLs to Express without forwarding browser authorization headers and allowlists capability cookies by route.
- `server/src/database/` manages MongoDB connection and readiness.
- `lib/server/auth-api-proxy.ts` forwards the frontend's existing same-origin auth paths to Express.
- `lib/auth-context.tsx` keeps compatibility tokens in memory rather than `localStorage`; the visual frontend remains based on the existing pages and components.
- `data/db.json` remains preserved for a separately approved data migration; all Next.js API handlers proxy to Express and no handler reads the JSON store.

## Remaining migration and security work

The importer has only been exercised in dry-run and isolated test contexts; no production data was applied and no live cutover was performed. Keep `data/db.json` unchanged until a separately approved migration. Opportunity creation and an Admin emergency-record review screen are not implemented, and the current browser verification used an ephemeral in-memory replica set rather than a persistent staging deployment.

Do not treat the application as production-ready until persistent staging validation, remaining workflows, operational monitoring, backup/restore drills, rate-limit tuning, a compatible CSP policy, and a separately approved data migration/cutover have been completed.
