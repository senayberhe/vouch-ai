# Web UI

`web/` is a React + TypeScript + Vite single-page app styled with Tailwind CSS v4 covering the whole workflow: sign in with a bearer token, upload and ask documents, submit research jobs and approve or reject them as an independent reviewer, run the model release lifecycle (register → evaluate → baseline/canary → observe → promote or roll back), run the **Quality** scorecard on a labeled sample (precision, recall, F1 with 95% intervals, per-group results and plain-language gate failures), see each model's signed evidence and artifact re-hash history, and manage incidents. Uploads report how much PII was redacted before storage. Tabs follow your role: **Quality** and **Incidents** for admins and reviewers, **Releases** only for the `CAPSTONE_RELEASE_TENANT`.

**With Docker Compose** the `web` service builds the app and serves it with nginx on `http://127.0.0.1:${CAPSTONE_WEB_PORT:-8090}`, proxying `/v1` to the `api` service. The browser only talks to one origin, so the API needs no CORS. nginx sends a strict Content-Security-Policy (scripts and styles from this origin only).

**For development** (hot reload), with the API running locally:

```bash
cd web
npm install
VITE_API_TARGET=http://127.0.0.1:8000 npm run dev   # use 8002 if the Compose API is on CAPSTONE_PORT=8002
# open http://127.0.0.1:5173
npm test            # vitest + Testing Library
npm run build       # type-check and production bundle in web/dist
```

Create an account or sign in with an email and password, or with **Continue with Google** when it is configured (see [`DEPLOYMENT.md` §3a](DEPLOYMENT.md#3a-accounts-and-google-sign-in)). Each account gets a private workspace. The session lives in an `HttpOnly` cookie that page scripts cannot read. Under **Use a development bearer token** you can still paste a token from `CAPSTONE_TOKENS_JSON`. Under `npm run dev` that section also lists those identities as one-click **Development only** buttons: `vite.config.ts` reads `../.env` only in dev-server mode, so production builds and tests never contain a token (set `VITE_DEV_SIGNIN=0` to hide them). The buttons also disappear when the dev server is started with a `--host` that other machines can reach, such as `0.0.0.0`. A pasted token is kept in `sessionStorage` (gone when the tab closes) and sent only as an `Authorization` header. Answers and reports are rendered as plain text, never HTML, because they quote untrusted documents.

The UI uses read-only, tenant-scoped listing endpoints: `GET /v1/me`, `/v1/documents`, `/v1/research/jobs` (your jobs plus reports you may review), `/v1/models` (release tenant only) and `/v1/incidents` (admins and reviewers).

## Visual design

The workspace uses a deep green sidebar, warm neutral surfaces, shared cards and form controls, and a separate introduction for each section. Navigation becomes a horizontal row on smaller screens, with sign-out available below it. Sign-in uses a split layout on desktop and a stacked layout on mobile. Colors follow the system light/dark preference; keyboard focus, a skip-to-content link, and reduced-motion preferences are supported. Source answers and reports continue to render as plain text.

Run the frontend, API, and research worker together from the repository root with `./scripts/dev.sh`, then open `http://127.0.0.1:5173`.

## Guided demo

In Knowledge, “Take your workspace for a spin” walks through loading two fictional policies, asking a suggested question, and opening a research job. Choose an access group and select **Load sample documents**. This stores samples through the ordinary upload API, with the same authorization and redaction as other documents. Retrying checks existing titles in that group to avoid repeating completed uploads.

Select **Try the sample question**, then **Ask**, and inspect the answer’s source citations. **Start demo research** creates a real scoped task and opens its report in Research. Run the worker with `./scripts/dev.sh`. A separate authorized reviewer must approve the report; a newly registered one-person workspace cannot independently approve its own report. Use configured author and reviewer demo identities in the same tenant and group when presenting this step.

The tour does not write anything until you select a load or research action. Answer generation uses your configured backend, so OpenAI mode may incur normal model usage. The sample policies are fictional, not organizational guidance.

Browser visual QA remains pending: check a narrow mobile viewport and desktop, light/dark mode, long document titles, keyboard navigation, and the full guided flow. Automated component tests cover sample loading, scoped questions, research navigation, permissions, and errors.
