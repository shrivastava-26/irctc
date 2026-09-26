# Local Browser Execution Worker

The Render app is the control plane. The local worker is the execution plane that launches Playwright from the user's own machine and network.

This keeps the IRCTC browser session and IRCTC credentials off the hosted server. The browser therefore uses the local network instead of Render's shared datacenter egress.

## 1. Render configuration

Add a random high-entropy value as the Render environment variable:

- `SIVA_WORKER_TOKEN`

Do not commit the token.

The web app can continue to run on Render. Jobs created by the UI use `executionTarget: LOCAL`, so the hosted scheduler does not launch a browser for them.

## 2. Local machine

Use Node.js 20+ and install the repository dependencies locally.

Set:

```text
SIVA_CONTROL_URL=https://YOUR-RENDER-SERVICE.onrender.com/api
SIVA_WORKER_TOKEN=<same secret as Render>
SIVA_WORKER_ACCOUNT=<IRCTC username used by this worker>
IRCTC_USERNAME=<IRCTC username>
IRCTC_PASSWORD=<IRCTC password>
```

For multiple accounts, use `SIVA_WORKER_CREDENTIALS_FILE` instead:

```json
{
  "primary": {
    "username": "your_irctc_username",
    "password": "your_irctc_password"
  }
}
```

Keep that file outside Git and restrict access to your user account.

Optional tuning:

```text
SIVA_WORKER_CONCURRENCY=1
SIVA_WORKER_POLL_MS=2000
SIVA_WORKER_HEARTBEAT_MS=15000
SIVA_WORKER_LEASE_MS=60000
```

The existing per-account mutex still serializes jobs for one account. Different accounts may run concurrently.

## 3. Start

```bash
npm install
npx playwright install chromium
npm run start:local-worker
```

The worker keeps polling the Render control plane. It claims only LOCAL jobs and reports state/log/result updates over authenticated HTTPS.

## 4. Scheduling

Scheduled jobs remain queued until the booking preparation window. The worker controls the claim timing, so the Render process does not need to hold an in-process timer for local execution.

## 5. Failure and recovery behavior

If the local worker disappears before the transactional boundary, the same worker identity can reclaim an expired lease and resume from local persisted run state.

A job owned by a different worker is never automatically stolen. This avoids silently duplicating a transaction after an uncertain worker failure.

No live booking is implied by CI. A real booking remains dependent on the local machine, local Playwright profile/session, current IRCTC availability, and a user-network authenticated run.
