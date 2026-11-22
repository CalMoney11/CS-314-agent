# Kyle phone app: setup

The iPhone app (`mobile-app/`, Expo / React Native, Cole's UI) talks to a small
Python API (`backend/`, FastAPI on Google Cloud Run). The backend holds the
Google, Canvas, and Claude credentials; the phone only holds the backend URL and
an API token.

```
iPhone app ──HTTPS + Bearer APP_API_TOKEN──► Cloud Run backend ──► Gmail (read-only)
  local notifications                                          ├─► Google Calendar (read-only)
  background refresh                                           ├─► Canvas (personal token)
                                                               └─► Claude (chat)
```

Everything is **read-only**: Google scopes are `gmail.readonly` + `calendar.readonly`,
and the chat has no tools, so nothing can be sent, deleted, or changed.

## 1. Google login (once)

1. Cloud Console → project **CS-407-agent** → Google Auth Platform → **Audience** →
   **Publish app**. While the app is in "Testing", Google expires tokens after 7 days.
2. From the repo root:
   ```bash
   backend/.venv/bin/python backend/scripts/authorize_google.py personal
   ```
   Approve in the browser ("Google hasn't verified this app" → Advanced → continue).
   This writes `tokens/app_personal.json` (gitignored). Repeat with another name
   (e.g. `school`) to add a second Gmail; deploy.sh picks up every `tokens/app_*.json`.

## 2. Secrets in `.env` (repo root)

See `env.example`. You need `ANTHROPIC_API_KEY` and `CANVAS_API_TOKEN`
(Canvas → Account → Settings → **+ New Access Token**). `APP_API_TOKEN` is generated
by deploy.sh if missing.

## 3. Run the backend locally (optional)

```bash
python3.12 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/pytest backend
backend/.venv/bin/uvicorn app.main:app --app-dir backend --reload
```

## 4. Deploy to Cloud Run

```bash
brew install --cask google-cloud-sdk && gcloud auth login
bash backend/deploy.sh
```

It enables the APIs, stores secrets in Secret Manager, deploys `cs314-agent-api` to
`us-west1`, and prints the URL. Billing must be enabled on the project (usage at this
scale fits the free tier). Re-run after changing code, `.env`, or tokens.

## 5. Put the app on your iPhone (free Apple ID)

1. `sudo xcode-select -s /Applications/Xcode.app` (once).
2. Xcode → Settings → Accounts → add your Apple ID.
3. iPhone: plug in by USB, trust the Mac, and turn on
   Settings → Privacy & Security → **Developer Mode**.
4. Build and install a standalone Release build:
   ```bash
   cd mobile-app && npm ci && npx expo run:ios --device --configuration Release
   ```
   If signing fails, open `mobile-app/ios/Kyle.xcworkspace`, select the **Kyle**
   target → Signing & Capabilities → Team = your Apple ID (Personal Team), then rerun.
5. First launch: iPhone Settings → General → VPN & Device Management → trust your
   developer certificate.
6. In the app: menu → **Settings** → paste the server URL and `APP_API_TOKEN` →
   **Save & Test**. Allow notifications when asked.

A free Apple ID signs the app for **7 days**; reinstall with step 4 each week
(a paid developer account makes it last a year and allows real push notifications).

## Notifications

- **New email**: when the app opens or iOS runs its background refresh, unread inbox
  messages it hasn't seen trigger a local notification. iOS chooses background timing
  (often every 15–60 min, more when charging on Wi-Fi). Keep Background App Refresh on.
- **Canvas deadlines**: reminders are scheduled 24h and 2h before each unfinished
  assignment/quiz/discussion, so they fire on time even if the app isn't running.

## Adding features later

- Backend: add a module in `backend/app/` and a route in `backend/app/main.py`
  (include it in `_dashboard()` if the home screen or background refresh needs it).
- App: add a screen file in `mobile-app/src/app/`, a `<Tabs.Screen>` in `_layout.tsx`,
  and a menu entry in `src/components/nav-header.tsx`. API types live in `src/lib/api.ts`.
