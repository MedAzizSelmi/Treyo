# Treyo

A training marketplace: learners find courses, trainers run them in groups,
administrators approve both. Built by Med Aziz Selmi (TEK-UP) for
LeanConsulting, hosted by BYB. Tunisian market — TND, French/Arabic/English/
Spanish, ClicToPay for card payments.

This file is read at the start of every session. It records the decisions a
newcomer would otherwise undo by accident.

## Layout

| | |
|---|---|
| `backend/` | Spring Boot 3.2, Java 17, PostgreSQL. The source of truth. |
| `treyo-mobile/` | React Native 0.81 / Expo SDK 54, expo-router. Learners and trainers. |
| `admin-dashboard/` | Next.js 16, App Router. Administrators only. |
| `ml-service/` | Python recommendation engine (TF-IDF + FAISS + collaborative filtering). |

## Running it

```bash
cd backend && ./mvnw spring-boot:run        # :8085
cd treyo-mobile && npm run lan              # Expo, LAN mode
cd admin-dashboard && npm run dev           # :3000
```

Build with `./mvnw -o` (offline) for speed; drop `-o` when adding a
dependency. `npx tsc --noEmit` typechecks both JS projects. `./mvnw -o test`
runs the backend suite.

After `npm install`, Metro must be restarted with `npx expo start --clear` —
it caches module resolution at startup and will report `UnableToResolveError`
for a package that is sitting right there.

## Things that will bite

**Never overwrite a file you have not read.** Writing `MessageController.java`
wholesale silently deleted the group chat endpoints; the same mistake earlier
deleted `POST /change-password` from `AccountController`. Prefer `Edit`. If a
full rewrite is genuinely needed, diff the endpoint list afterwards.

**Secrets live only in gitignored files.** `application.properties`, `.env`.
Never echo a secret into chat or a shell command. Never log into the database
with a password — hand the user a `psql` command and let them type it.
`google-services.json` *is* committed: Google ships it inside the APK, so it
is not a secret, and EAS cannot upload what git does not track. The Firebase
**service-account key** is a secret and is gitignored.

**Schema changes need a migration in `backend/src/main/resources/db/migrations/`**,
dated `YYYY-MM-DD_name.sql`, idempotent, applied by hand. `ddl-auto=update` will
have already added columns as nullable with no default, so
`ADD COLUMN IF NOT EXISTS … NOT NULL DEFAULT x` silently does nothing — add the
column, backfill, then set the default and NOT NULL as separate statements.

**Identity comes from the token, never from a request parameter.** Use
`FileAccessService.caller()`. Every endpoint under `/api/messages` once took
the user id as a parameter and acted on it unchecked.

**Only access tokens authenticate.** Refresh tokens and 2FA challenges carry
`userId` and `role` too; `JwtAuthenticationFilter` rejects anything with a
`type` claim. Do not relax that.

**Payment status is re-verified server-side, always.** Never trust a client
saying a payment succeeded. `PaymentService.isPaidFor` also checks the order
number references the right student *and* course — otherwise a valid reference
for a cheap course unlocks an expensive one.

**Card data is never stored.** ClicToPay's anti-fraud terms are stricter than
PCI-DSS: no number, no CVV, **no expiry date**. Only brand and last four, taken
from the mask the gateway applies. The card is typed on ClicToPay's hosted page
and never reaches this server.

**Don't ship UI that does nothing.** A button wired to `console.log`, a search
bar that is a `<Text>`, a toggle that writes to local storage — this codebase
had all three. Either make it work or remove it.

**Messaging is group chats only, and that is a product decision.** There is no
one-to-one chat and there should not be: nothing starts a direct conversation,
both Messages lists filter to `isGroup`, and the dashboard does the same. A
group chat appears for a learner when their enrolment is assigned a `groupId`,
for the trainer who runs it, and for every admin.

The backend still has DM endpoints and a `Message` table that supports them —
that is dormant scaffolding, not a half-finished feature. A 1-to-1 screen was
once built on the strength of a comment reading *"DM taps are intentionally a
no-op"*, by reading past the word "intentionally". Don't repeat that. If
learner-to-trainer contact is ever wanted, it is a product conversation first.

**A comment saying something is deliberate is evidence.** Prefer asking over
assuming a gap.

## Conventions

Commit messages explain **why**, in prose, not bullet lists of what changed.
End with `Co-Authored-By: Claude <noreply@anthropic.com>`. Commit and push only
when asked.

Mobile strings go in all four locales (`treyo-mobile/i18n/locales/`). Diagrams
for the report are portrait. The user wants complete files, not fragments.

## State, October 2026

Development is complete. Everything below is deliberate, not missing.

**Done:** ClicToPay payments with a sandbox-tested cahier des recettes; email
verification; self-service account deletion; Google and LinkedIn sign-in; TOTP
two-factor with recovery codes; session revocation (`tokens_valid_from`); group
chat over STOMP with typing indicators and push notifications, live in the
dashboard too; PDF payment receipts emailed on purchase; FCM; recommendation
engine.

**Blocked, not forgotten:** Apple sign-in needs a paid Apple developer account
(`social.apple.client-ids` is empty, and App Store review *requires* it once
Google sign-in is offered). Play data-safety and Apple privacy forms happen at
submission.

**For a human, not this codebase:** whether these sales need real factures with
gap-free sequential numbering rather than the current receipts, and whether VAT
applies at all — LeanConsulting's accountant. ClicToPay also require KYC at
registration and 18 months of transaction evidence.

**Next:** DevOps — CI, off-site backups, `app.swagger.enabled=false` in
production — then the VPS, which still runs an old dashboard build, so
`verify-email`, `reset-password`, `delete-account` and the legal pages 404 in
production and several migrations are unapplied there.

## LinkedIn sign-in is server-side

Unlike Google. LinkedIn refuses custom-scheme redirects and its token exchange
needs a client secret an app cannot hold, so the browser talks to the backend
and the app receives a one-time code, never tokens in a URL. Don't "simplify"
it to match Google.
