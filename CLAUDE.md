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
Don't put `nullable = false` on a new field's `@Column` either: Hibernate
then tries to add it as NOT NULL to a table with rows, Postgres refuses, and
the column silently never appears. Leave NOT NULL to the migration. New enum
values need the column's CHECK constraint rebuilt too — Hibernate never
alters one (see `2026-10-22_account_confirmation_codes.sql`).

**Identity comes from the token, never from a request parameter.** Use
`CallerGuard` (`self`, `selfOrAdmin`, `requireOwnerOrAdmin`, `requireAdmin`),
or `FileAccessService.caller()` underneath it. Every endpoint under
`/api/messages`, and later most of the trainer, enrollment, notification,
interaction, feed and review endpoints, took the user id as a parameter and
acted on it unchecked. Clients still send those ids; the guard only accepts
the caller's own. `OwnershipChecksTest` covers them — add a case when you
add an endpoint that names a user.

**Only access tokens authenticate.** Refresh tokens and 2FA challenges carry
`userId` and `role` too; `JwtAuthenticationFilter` rejects anything with a
`type` claim. Do not relax that.

**`/ws/**` is `permitAll` on purpose.** A WebSocket upgrade cannot carry an
Authorization header, so requiring a JWT there refused every handshake with
a 401 — live chat never worked until it was opened. Authentication happens
on the STOMP CONNECT frame in `StompAuthChannelInterceptor`.
`GroupChatRealtimeTest` connects the way the app does; if it fails, chat is
down. In production nginx needs a `location /ws/` block with the Upgrade
headers, or `/ws` falls through to the dashboard.

**Payment status is re-verified server-side, always.** Never trust a client
saying a payment succeeded. `PaymentService.isPaidFor` also checks the order
number references the right student *and* course — otherwise a valid reference
for a cheap course unlocks an expensive one.

**Course prices are HT.** Admins set them before VAT, the app labels them
HT / excl. VAT / Base imp. / خ.ق.م, and the card is charged the price plus
VAT — `VatPolicy`, driven by `receipt.vat.*`. The server sends `vatRate` and
`priceInclVat` with each course so the app never computes the total itself.
Payments before October 2026 were charged the bare price; their receipts
still come out right because the breakdown is derived from what was paid.

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

**Groups form themselves, and there are no refunds.** Since October 2026
`GroupAutomationService` runs the flow with no admin clicks except one:
enough requests open a group and ask the trainer to schedule it; the
trainer schedules; an admin approves the schedule (or edits it, or writes
it) on the dashboard; every requester is told the dates and pays to join.
48h before the first session admins get a call list of who has not paid
(learners now give a phone number at onboarding for this) and those learners
get a reminder; at 24h the group starts with whoever paid, or closes if
nobody did — nothing is charged. Late joins stay open until the first
session; then, or at closing, the unpaid invitees' requests are ended and
they are told they can ask again, so the course page never shows a request
that no longer counts. The way to pay is never only the notification: the
course page shows "See dates & pay" (`GET /api/groups/course/{id}/my-offer`),
and a learner already enrolled is refused before the gateway, not after.
Trainers are reminded after 2 days without a schedule, admins after 5.
Payment is refused before the gateway if the group is not approved, has
started or is full, because LeanConsulting will not refund — that is the
boss's call, for the organisation's image, so don't add a refund path.
Once approved the trainer cannot change the schedule (409); an admin can.
Only requests newer than a course's last group count towards the next one,
so learners who were invited and didn't pay don't reopen it. Notifications
double as the "already sent" record. Groups formed by hand before this
(enrolments confirmed with no group) keep the dashboard's Form Group.
`GroupFlowTest` walks the whole flow.

**Course suggestions turn away noise in layers, not by detecting it.** A
learner who cannot find a course suggests it (from an empty search, or the
profile); admins look for a trainer and link the course, which tells every
learner behind it by notification, push and email and registers their
request, so the group flow takes over. No rule tells "C#" or "SAP FICO"
from gibberish, so the form only asks for a letter or digit and a sentence
of what they want to learn — don't tighten it, it refused "C#" once. The
rest: at most 3 open per learner, admins close noise as "Not a course"
without telling anyone, and **nothing a learner typed reaches other
learners until an admin accepted it** ("me too" lists only accepted ones).
Searches that found nothing (`search_logs.result_count = 0`, sent only
when no filter is on) are grouped by `TextMatch` and shown once two
different learners made them. `TextMatch.java` and the app's
`utils/textMatch.ts` are the same rules — change both. Showing the demand to
trainers was deliberately left out for now.

**Learners choose "skills to develop", from a list admins manage.** Never
"interests" on screen — the boss read it as a hobby; the field is still
`specificInterests` in code and `students.specific_interests` in the
database. The skills live in `skill_options` (dashboard → Skills), seeded
by `2026-10-25_skill_options.sql` with the list the app used to hard-code;
seeded there, not at startup, so a deleted skill stays deleted. A profile
stores the skill's English `name`, which the recommendation engine reads;
`name_fr/ar/es` are display only. The server accepts only listed skills
under the learner's fields — they show on the public profile. A skill
learners chose can be hidden but not deleted. The eight onboarding fields
themselves (`informatique`, `marketing`…) are still fixed, in
`SkillOptionService.FIELDS` and the app's onboarding step 1; they are not
the admins' course Domains. The learner ticks a box confirming these are
the skills they want to develop now before going on.

**Experience is entries, skills are picked — on the CV screens and edit
profile.** Organisation, position, from/to months ("YYYY-MM", `to` null =
present), one "+ Add experience" at a time, filled from Affinda's
`workExperience` when a CV is parsed. Stored as JSON in
`experience_entries`; `professional_experience` keeps a readable English
text the server writes from them (and trainers' `experience_years`), so the
dashboard and old readers still work — never write that text yourself when
sending entries. A save that sends neither leaves the experience alone:
learners who onboarded before this have only the text, and edit profile
only sends entries once they are changed. Learners may tick "no experience
yet"; trainers need at least one entry. The skills box suggests from the
admins' Skills list only (all groups, plus a `general` group that is never
offered at onboarding step 2), shows them in the app's language, saves the
English name, and still accepts a typed skill — CV skills are open-ended.

**New trainers are introduced in the feed, not by notification.** A
notification per trainer teaches learners to ignore notifications, the
group and payment ones included. An admin presses "Introduce" on the
dashboard's Trainers tab and writes a short introduction; the server
(`TrainerIntroService`) allows it only for an approved trainer with at
least one published course, once while it is up. The `NEW_TRAINER` post is
pinned first for three days (`pinned_until`), translated into all four
languages — admins may write in any of them — and its card opens the
trainer's profile. No push. Introductions don't count as the day's posts,
or the morning AI batch would skip a day an admin posted early.
Feed translations had never worked until October 2026: the reply cleaner
cut Gemini's bare JSON array to its first object, so `feed_post_translations`
was empty and everyone read the feed in English.

## Conventions

Commit messages explain **why**, in prose, not bullet lists of what changed.
End with `Co-Authored-By: Claude <noreply@anthropic.com>`. Commit and push only
when asked.

Mobile strings go in all four locales (`treyo-mobile/i18n/locales/`).
The admin-created course categories are **"Domain"** on screen and `module`
in code, API (`/api/modules`) and database — the word "module" was dropped
at the October 2026 review. A course's `domain` field holds the chosen
domain's name. Likewise a course's `materialUrl` / `materialName` hold its
**course plan** (outline and schedule; PDF, Word or PowerPoint, required at
submission), not the course content — trainers stopped uploading the course
itself at that review. Diagrams
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
