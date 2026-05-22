# Treyo / BYB Match

AI-powered trainer–student matching platform.

| Folder | Stack | Purpose |
|--------|-------|---------|
| `backend/` | Spring Boot (Java) | REST API, auth, business logic |
| `ml-service/` | FastAPI (Python) | Course recommendation engine |
| `treyo-mobile/` | Expo / React Native | Student + trainer mobile app |
| `admin-dashboard/` | Next.js | Admin web dashboard |

---

## Getting started

### 1. Create your config files

Secrets (API keys, DB passwords) are **not** committed to git. Each
service ships a `.example` template — copy it and fill in real values.
The copies are gitignored, so they never get pushed.

```bash
# Backend
cp backend/src/main/resources/application.properties.example \
   backend/src/main/resources/application.properties

# Mobile
cp treyo-mobile/.env.example treyo-mobile/.env

# ML service
cp ml-service/.env.example ml-service/.env
```

Then open each copied file and replace every `CHANGE_ME` / `YOUR_*`
placeholder with a real value:

| File | Needs |
|------|-------|
| `backend/.../application.properties` | PostgreSQL password, JWT secret, Gemini API key, Konnect API key + wallet ID |
| `treyo-mobile/.env` | Affinda API key |
| `ml-service/.env` | PostgreSQL password |

Where to get the keys:
- **Gemini** — <https://aistudio.google.com> → API keys
- **Affinda** — <https://affinda.com>
- **Konnect** — <https://konnect.network> (Tunisian payment gateway)

If you're joining an existing team, ask a teammate to send you the
values **privately** (password manager / DM) — never via the repo.

### 2. Database

Create a PostgreSQL database named `Matching` (or change the name in
both `application.properties` and `ml-service/.env`). Tables are
created automatically by Hibernate on first backend run.

### 3. Run each service

```bash
# Backend  → http://localhost:8085
cd backend && ./mvnw spring-boot:run

# ML service  → http://localhost:8000
cd ml-service && pip install -r requirement.txt && uvicorn main:app --reload

# Admin dashboard  → http://localhost:3000
cd admin-dashboard && npm install && npm run dev

# Mobile app
cd treyo-mobile && npm install && npx expo start
```

---

## Security note

Never commit real secrets. The following are gitignored on purpose —
if `git status` ever shows one of them as tracked, stop and fix it:

- `backend/src/main/resources/application.properties`
- `treyo-mobile/.env`
- `ml-service/.env`
- `Treyo API Keys.txt`

Quick check before any push (should print nothing):

```bash
git ls-files | grep -E "application\.properties$|\.env$|API Keys"
```
