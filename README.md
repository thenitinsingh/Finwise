# Finance Intelligence Agent (Finwise)

A classroom-friendly full-stack demo of two AI patterns on **fictional** personal-finance data:

1. **GenAI extraction** — raw bank text or a receipt/statement → structured, schema-validated transactions → a finance dashboard.
2. **A bounded AI agent** — a ReAct-style loop (max 6 steps) that uses deterministic tools to find silent subscription price hikes, annualise their cost and draft a dispute message that **waits for human approval and is never sent**.

> ⚠️ **Educational demo, not financial advice.** Use fictional or redacted data only — **do not upload real bank statements.** Nothing is persisted, and the app never sends email, contacts merchants or banks, or moves money.

The whole flow works **without an AI key** ("demo mode"): sample data, the dashboard and the full agent audit run on a deterministic planner. Only extraction needs the LLM integration, which you hand-code in one file.

---

## Chosen stack and why

| Part | Stack | Why |
|---|---|---|
| `server/` | **Node.js 20+, Express 5, Zod, Multer, csv-parse, dotenv** | One language across the project; Express is the most widely taught HTTP framework; Zod gives readable schema validation for every model; Multer keeps uploads in memory only. |
| `client/` | **React 19 + Vite** | The standard modern single-page setup: fast dev server, one-command production build. The chart is hand-drawn SVG, so there is no chart library to learn. |
| Tests | **`node:test`** (built into Node) | No test framework to install; tests use the built-in `fetch` against a real server instance. |

Six runtime dependencies on the server, two on the client. No LLM SDK is installed — you add your provider's SDK when you implement `server/src/ai/aiService.js`.

---

## Project structure

```
finance-intelligence-agent/
├── client/                         # Client: single-page dashboard + approval UI
│   ├── index.html
│   ├── vite.config.js              # exposes SERVER_URL to the client
│   ├── .env.example                # SERVER_URL, CLIENT_PORT
│   ├── src/
│   │   ├── App.jsx                 # state, data loading, request handling
│   │   ├── lib/api.js              # JSON API calls to the server
│   │   ├── lib/dashboard.js        # metrics, chart and category maths (L3)
│   │   ├── components/             # Sidebar, metrics, chart, import, table, agent, approval
│   │   └── styles.css
│   └── tests/dashboard.test.js     # AC4–AC7 calculation checks
├── server/                         # Server: API, agent, tools, AI boundary
│   ├── .env.example                # AI_API_KEY, AI_MODEL, CLIENT_ORIGIN, PORT
│   ├── src/
│   │   ├── index.js                # entry point (npm start)
│   │   ├── app.js                  # Express app, CORS, error handling
│   │   ├── config.js               # environment configuration
│   │   ├── api/
│   │   │   ├── routes.js           # HTTP routes
│   │   │   ├── extraction.js       # extraction pipeline + 2nd validation layer (L1)
│   │   │   ├── auditAgent.js       # bounded agent loop + approval state machine (L7, L9, L10)
│   │   │   └── sessionStore.js     # in-memory session store
│   │   ├── models/schemas.js       # Zod schemas for every model (Section 5)
│   │   ├── tools/financeTools.js   # deterministic tools (L4–L6)
│   │   ├── ai/aiService.js         # AI boundary — STUB with TODO(manual) markers
│   │   └── data/sampleTransactions.js
│   └── tests/                      # tools, API and structure/safety tests
├── README.md
└── .gitignore
```

---

## Prerequisites

- **Node.js 20.19+ or 22.12+** (includes npm). Check with `node --version`.
- Two terminal windows (one for the server, one for the client).

Default ports: **server 8000**, **client 5173**.

---

## Run it locally

### 1. Server

macOS / Linux:

```bash
cd server
cp .env.example .env
npm install
npm start
```

Windows (PowerShell):

```powershell
cd server
Copy-Item .env.example .env
npm install
npm start
```

Windows (Command Prompt): use `copy .env.example .env` instead of `Copy-Item`.

You should see `Finwise server listening on http://localhost:8000`. Check it at <http://localhost:8000/api/health>.
Use `npm run dev` instead of `npm start` to restart automatically when you edit server files.

### 2. Client

macOS / Linux:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Windows (PowerShell):

```powershell
cd client
Copy-Item .env.example .env
npm install
npm run dev
```

Open <http://localhost:5173>. The sample data loads automatically.

Copying `client/.env` is optional — without it the client uses `http://localhost:8000`.

### Production build of the client

```bash
cd client
npm run build      # outputs client/dist
npm run preview    # serves the build on the client port
```

---

## Configuration

| Where | Variable | Default | Meaning |
|---|---|---|---|
| `server/.env` | `AI_API_KEY` | `replace_me` | LLM key. Empty or `replace_me` = **not configured** (demo mode). |
| `server/.env` | `AI_MODEL` | `your-model-name` | Model name your AI service uses. |
| `server/.env` | `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origins, comma-separated. |
| `server/.env` | `PORT` | `8000` | Server port. |
| `client/.env` | `SERVER_URL` | `http://localhost:8000` | Server base URL used by the client. |
| `client/.env` | `CLIENT_PORT` | `5173` | Client dev server port. |

The API key lives only in `server/.env` (git-ignored). The client never sees it and never calls an LLM.

---

## Run the tests

```bash
cd server
npm test     # tools, API (offline mode), structure and safety checks

cd ../client
npm test     # dashboard calculations (AC4–AC7)
npm run build
```

The server suite covers the spec's unit tests (sample hike, $588 annual cost, unsent draft, flat Spotify, exact-10% boundary, negative input), the API acceptance criteria (AC3, AC4, AC8–AC16), the edge cases E1–E8 and E12–E20, and static checks that no server code makes outbound calls (AC17), that only the AI service is an LLM boundary (AC18), and that the folder naming rule holds (AC18b).

---

## 6-step demo flow

1. **Open the app.** The 14 fictional transactions load automatically. The top bar shows **Demo mode available** (or **AI connected** once a key is configured). Point out the metrics: **14** transactions, **6** merchants, **$364.34** outflow, **$221.34** subscriptions.
2. **Read the dashboard.** The monthly chart (Jun–Sep), category bars and the table — every row keeps its **raw source line**, and every total is computed in code, never by the LLM.
3. **Try extraction.** Click **Use example**, then **Extract transactions**. In demo mode you get a clear red banner (*AI is not configured…*) and your existing transactions stay put. With the AI implemented, the three example rows replace the table and the chart pill changes to **Your input**.
4. **Run the agent.** Click **Run agent audit**. Walk through the trace: `detect_stealth_hikes` → `calculate_annual_leakage` → `generate_cancellation_script`, each with its planned arguments and a timestamp.
5. **Review the finding and draft.** One card: **StreamBox Premium +30%**, $37.69 → $49.00/month, +$11.31/month, **$588.00/year**. The draft is labelled **NOT SENT**, and the audit status is *awaiting approval*.
6. **Decide.** Click **Approve simulation** (or **Reject**). The decision is logged in the trace, the buttons disappear, and the summary confirms that nothing was sent.

---

## API

All endpoints are JSON over HTTP. Errors are always `{"detail": "message"}`.

| Method | Path | Purpose | Notable statuses |
|---|---|---|---|
| GET | `/api/health` | `{"status":"ok","ai_configured":bool}` | 200 |
| GET | `/api/sample` | 14 fictional USD transactions | 200 |
| POST | `/api/extract` | Multipart `text` and/or `file` → `{transactions, notes, validation_errors, count}` | 400, 413, 502, 503 |
| POST | `/api/audits` | `{transactions, goal}` → full AuditSession | 400 |
| GET | `/api/audits/{session_id}` | Read audit state and trace | 404 |
| POST | `/api/audits/{session_id}/approval` | `{"decision":"approve"\|"reject","reason"?}` | 404, 409, 400 |

Quick check with curl (macOS/Linux):

```bash
curl http://localhost:8000/api/health
curl -s http://localhost:8000/api/sample \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify({transactions:JSON.parse(s).transactions})))' \
  | curl -s -X POST http://localhost:8000/api/audits -H "Content-Type: application/json" -d @-
```

There is no auto-generated API documentation page in this stack; the table above and `server/src/api/routes.js` are the reference.

---

## Changes in v1.1 (Gemini)

- **AI is implemented** in `server/src/ai/aiService.js` using the Gemini REST API (default model `gemini-3.8-flash`). Set `AI_API_KEY` in `server/.env`.
- **No dummy data:** the dashboard starts empty. Uploads are added to it (exact duplicates are skipped); **Clear data** empties it.
- **Receipts and statements (PNG/JPG/WEBP/PDF/CSV/TXT)** are read by Gemini; rows are cleaned (amounts, dates, category synonyms) before validation.
- **Guardrails:** non-financial files/text return HTTP 422 with a clear message; the chat refuses off-topic questions (422); unsupported file types return 400.
- **Ask Finwise chat** (`POST /api/chat`): totals, monthly averages, shares and benchmark ranges are computed in code and passed to Gemini, which explains them and gives an action plan.
- Optional `client/.env`: `VITE_CURRENCY=INR` to show rupees.

## Implementing the AI integration (developer task, historical)

Everything LLM-related lives in **`server/src/ai/aiService.js`**. Nothing else in the server imports an LLM SDK.

1. `npm install <your provider's SDK>` inside `server/`, and set `AI_API_KEY` and `AI_MODEL` in `server/.env`.
2. In `createLlmClient()`, replace `TODO(manual): create the LLM client` with your client constructor and return it.
3. In `extractStatement()`, replace `TODO(manual): call the LLM with structured output matching Statement, temperature 0`. Use `EXTRACTION_PROMPT` as the system prompt, send the text and/or file (images/PDFs as your provider expects), and return `{ transactions, notes }`. Throw a normal `Error` on failure → the API returns 502.
4. In `chooseNextStep()`, replace `TODO(manual): LLM planner returning AgentDecision via structured output` and return `{ tool_name, arguments, message }`. `PLANNER_PROMPT` is ready to use.

You don't need to change anything else. The server will still re-validate every extracted row, refuse tools outside the allowlist, re-ground the planner's arguments against real findings, cap the loop at 6 steps and stop before any draft is "acted on".

After integrating, verify AC19–AC22: health shows **AI connected**, **Use example → Extract** returns 3 rows with `raw_line` preserved, a line with no date comes back with `date: null` plus a note, and the sample audit still ends at **$588.00**.

---

## Teaching notes

- **Grounded extraction:** the prompt forbids invented values; unclear dates stay `null` and are explained in `notes`.
- **Two validation layers:** structured output from the LLM, then a Zod re-validation of every row on the server. Invalid rows are reported (`validation_errors`) and never shown.
- **Deterministic tools for maths:** totals, percentages and annual costs are computed in code. Money is compared in integer cents, so "exactly +10%" is exactly 10% (and is not flagged — the threshold is *strictly greater than*).
- **Bounded agent:** 6 iterations max, a 4-name allowlist, and a planner whose output is treated as untrusted.
- **Argument grounding:** if the planner asks for `calculate_annual_leakage("Netflix", 9999)`, the server ignores those values and uses the matched (or first) detected finding. The trace still shows what was asked, so learners can see the guardrail working.
- **Human-in-the-loop:** a draft always stops the loop at `awaiting_approval`. "Approve" records a local simulation; `sent` is always `false`.
- **Prompt-injection defence:** transaction text is data, not instructions, and even a fully compromised planner can only pick from the four read-only tools.
- **"Annual leakage" naming:** the tool returns the full annualised cost of the *new* price ($49.00 × 12 = $588.00), as the spec requires — not the yearly cost of the increase alone ($11.31 × 12 = $135.72). Worth calling out in class.

## Known limitations

- Single user, local only, no authentication, no database. Audit sessions live in memory and disappear on restart (approving an old session then returns 404 — run the audit again).
- No deduplication: identical transactions show as separate rows.
- USD display only; no currency conversion.
- Transactions cannot be edited in the UI.
- Extraction needs the hand-coded AI integration; until then it returns 503 by design.
- The goal text is passed to the planner but the offline planner ignores it — it always runs the same detect → calculate → draft sequence.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Red banner *"Could not load sample data. Is the server running?"* | Start the server (`cd server && npm start`) and check <http://localhost:8000/api/health>. Make sure `SERVER_URL` in `client/.env` matches the server address, then restart `npm run dev`. |
| Browser console shows a CORS error | Add the exact client URL (e.g. `http://localhost:5174`) to `CLIENT_ORIGIN` in `server/.env` and restart the server. |
| *"AI is not configured…"* when extracting | Expected in demo mode. Set `AI_API_KEY` in `server/.env` **and** implement the TODOs in `server/src/ai/aiService.js`. |
| *"AI extraction failed: …"* (502) | The model call failed — check the key, `AI_MODEL`, quota and network. Retry manually; there are no automatic retries. |
| *"Port 8000 is already in use"* | Set `PORT=8001` (for example) in `server/.env`, set `SERVER_URL=http://localhost:8001` in `client/.env`, and restart both. |
| Client port already in use | Vite picks the next free port automatically; add that origin to `CLIENT_ORIGIN`, or set `CLIENT_PORT` in `client/.env`. |
| `npm install` fails on an old Node version | Upgrade to Node 20.19+ or 22.12+. |
