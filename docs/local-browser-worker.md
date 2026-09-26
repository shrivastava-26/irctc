# Local Browser Execution Worker

The Render app is the control plane. The local worker is the execution plane that launches Playwright from the user's own machine and network.

This keeps the IRCTC browser session and IRCTC credentials off the hosted server. The browser therefore uses the local network instead of Render's shared datacenter egress.

## 1. Render configuration

Add a random high-entropy value as the Render environment variable:

- `SIVA_WORKER_TOKEN`

Do not commit the token.

For reliable queued-job persistence across Render restarts/redeploys, also set `SIVA_DATA_DIR` to a directory backed by persistent storage. Render Free web services cannot attach persistent disks, so without a persistent datastore/disk the control-plane job file can be lost on restart. Render documents that Free services have an ephemeral filesystem. A paid service can attach a persistent disk; alternatively migrate `JobStore` to Render Postgres/Key Value when needed.

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

The Book screen shows **LOCAL BROWSER · ONLINE/OFFLINE**. The worker publishes a presence heartbeat, and the UI will refuse to create a local automation job while no worker is online.

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


## Control-plane persistence

The job store honors `SIVA_DATA_DIR`. If you attach a Render persistent disk, point this variable at the disk mount path, for example:

```text
SIVA_DATA_DIR=/var/data/siva
```

This preserves the job queue and control-plane state across service restarts. The local worker keeps its own Playwright profiles and booking run state on the execution machine.
