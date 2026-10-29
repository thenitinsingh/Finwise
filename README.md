# Finwise: Finance Intelligence Agent

Finwise is a personal-finance web app. You upload a bank statement or receipt, and the app reads it with Google Gemini, builds a spending dashboard, and lets you ask a finance coach questions about your own numbers.

---

## What it does

1. **Reads your documents.** Upload a PDF, PNG/JPG/WEBP image, CSV or TXT file, or paste raw transaction text. Gemini turns it into structured transactions (merchant, date, category, amount).
2. **Shows a dashboard.** Total transactions, total outflow, subscription charges, total income, a monthly spending chart, spending by category and a full transactions table. Every number is calculated in code, never by the AI.
3. **Combines uploads.** Each upload is added to what is already on the dashboard. Exact duplicates are skipped. "Clear data" empties everything. The dashboard starts empty.
4. **Answers finance questions ("Ask Finwise").** Ask things like "How can I control my spending on petrol?". The server calculates your spending per category, monthly averages, share of income and rule-of-thumb benchmark ranges, then Gemini explains them and suggests an action plan.
5. **Rejects anything out of scope.** Images or text that are not bank statements, receipts or transaction lists get a clear error. Chat questions that are not about personal finance get a clear error.

---

## How it works

```
Browser (React)  ──►  Server (Express)  ──►  Google Gemini
  dashboard, chat       validation, maths      reads documents,
                        guardrails             writes explanations
```

**Upload flow**

1. The browser sends the file or text to `POST /api/extract`.
2. The server checks the file type and size, parses CSV files itself, and sends the content to Gemini with the extraction prompt.
3. Gemini first decides whether the input is financial. If not, the server returns HTTP 422 and the page shows the message.
4. If it is, Gemini returns transactions. The server then cleans each row (amounts like `₹1,250.50`, dates like `14/09/2026`, category synonyms like "petrol" become `1250.5`, `2026-09-14` and `Fuel`) and validates it against a strict schema. Rows that still fail are listed as rejected and never shown.
5. The browser merges the valid rows into the dashboard and recalculates every figure.

**Chat flow**

1. The browser sends your question, the recent conversation and the transactions on screen to `POST /api/chat`.
2. The server computes a finance summary in code: totals, monthly averages, share of spending and income, top merchants and benchmark ranges (for example fuel: 4–8% of income).
3. Gemini receives the summary and your question. It may only quote numbers from the summary. It answers, or marks the question out of scope, in which case the server returns HTTP 422.
4. If no monthly income appears in your uploads, the coach says so and asks you for it instead of guessing.

**Guardrails**

| Situation | Result |
|---|---|
| Photo, resume, recipe or blank image | 422: "This does not look like a bank statement, receipt or list of transactions…" |
| Unsupported file type (for example `.docx`) | 400: "Unsupported file type…" |
| Empty file, or file over 12 MB | 400 / 413 with a clear message |
| Off-topic chat question | 422: "I can only help with personal finance…" (shown as a red message in the chat) |
| Instructions hidden inside a file or message | Treated as data and ignored |
| No API key, or Gemini unavailable | 503 / 502 with a readable message |

---

## Tech stack

| Part | Stack |
|---|---|
| `server/` | Node.js 20+, Express 5, Zod, Multer, csv-parse, dotenv. Gemini is called with Node's built-in `fetch`, so there is no AI SDK. |
| `client/` | React 19 + Vite. The chart is hand-drawn SVG, so there is no chart library. |
| Tests | `node:test`, built into Node. |

---

## Project structure

```
├── client/                       # The page you open in the browser
│   ├── .env.example              # SERVER_URL, CLIENT_PORT, VITE_CURRENCY
│   ├── index.html                # Page title and font links
│   ├── src/
│   │   ├── App.jsx               # State: transactions, uploads, chat
│   │   ├── styles.css            # All styling (colours, fonts, radius at the top)
│   │   ├── lib/api.js            # Calls to the server
│   │   ├── lib/dashboard.js      # Totals, chart data, currency formatting, merging uploads
│   │   └── components/           # Layout, Dashboard, SpendingChart, ImportPanel,
│   │                             #   TransactionsTable, ChatPanel, Icon
│   └── tests/dashboard.test.js
├── server/                       # API, guardrails and the Gemini connection
│   ├── .env.example              # AI_API_KEY, AI_MODEL, CLIENT_ORIGIN, PORT
│   ├── scripts/check-gemini.js   # Times a tiny Gemini call per model
│   ├── src/
│   │   ├── index.js              # Entry point (loads .env, starts the server)
│   │   ├── app.js                # Express app, CORS, error handling
│   │   ├── config.js             # Environment settings and default model
│   │   ├── ai/aiService.js       # The only file that talks to Gemini
│   │   ├── ai/prompts.js         # Extraction and chat prompts, user-facing messages
│   │   ├── api/routes.js         # HTTP routes
│   │   ├── api/extraction.js     # Upload checks and extraction pipeline
│   │   ├── api/normalize.js      # Cleans AI output before validation
│   │   ├── models/schemas.js     # Zod schemas
│   │   └── tools/                # Finance maths (summary for chat) and money helpers
│   └── tests/
├── Prompts/                      # Plain-text copies of the prompts for reading
└── README.md
```

The prompts that the app really uses are in `server/src/ai/prompts.js`. The files in `Prompts/` are reference copies; `planner-prompt.txt` belongs to an old audit feature that is no longer shown.

---

## Run it locally

**You need:** Node.js 20.19+ (or 22.12+) and a Gemini API key from <https://aistudio.google.com/apikey>. Keys that start with `AQ.` or `AIza` both work.

### 1. Configure

Create `server/.env` (copy `server/.env.example`):

```dotenv
AI_API_KEY=your_key_here
AI_MODEL=gemini-3.5-flash-lite
CLIENT_ORIGIN=http://localhost:5173
PORT=8000
```

Optionally create `client/.env` (copy `client/.env.example`):

```dotenv
SERVER_URL=http://localhost:8000
CLIENT_PORT=5173
VITE_CURRENCY=INR
```

### 2. Start the server

```bash
cd server
npm install
npm run dev
```

The terminal should print `Finwise server listening on http://localhost:8000` and `AI model in use: gemini-3.5-flash-lite`. You can also check <http://localhost:8000/api/health>.

### 3. Start the client

```bash
cd client
npm install
npm run dev
```

Open <http://localhost:5173>. The top bar shows **AI connected** when the server has a key.

> Changes to `server/.env` or `client/.env` need a restart of that program. Values in `server/.env` override any same-named variable already set in your terminal or system.

---

## Configuration

| File | Variable | Default | Meaning |
|---|---|---|---|
| `server/.env` | `AI_API_KEY` | none | Gemini key. Empty or `replace_me` means not configured. |
| `server/.env` | `AI_MODEL` | `gemini-3.5-flash-lite` | Gemini model name. |
| `server/.env` | `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origins, comma-separated. Any `localhost` port is also accepted. |
| `server/.env` | `PORT` | `8000` | Server port. |
| `client/.env` | `SERVER_URL` | `http://localhost:8000` | Where the page finds the server. Must match the server `PORT`. |
| `client/.env` | `CLIENT_PORT` | `5173` | Port of the page. |
| `client/.env` | `VITE_CURRENCY` | `USD` | Currency shown, for example `INR`, `USD`, `EUR`, `GBP`. Words like `RUPEE` are accepted; unknown values fall back to `USD`. |

The API key stays on the server. The browser never sees it and never calls Gemini directly. `.env` files are git-ignored: never commit or share them.

### Choosing a model

- `gemini-3.5-flash-lite` (default): fast and cheap, good for statements and receipts.
- `gemini-3.8-flash`: more capable if Flash-Lite misreads a messy document, but slower.
- `gemini-2.5-flash` is closed to new Google accounts and returns "no longer available to new users".

To compare speed on your own key, run this from the `server` folder:

```bash
node scripts/check-gemini.js
```

---

## API

All endpoints return JSON. Errors are always `{"detail": "message"}`.

| Method | Path | Purpose | Statuses |
|---|---|---|---|
| GET | `/api/health` | `{"status":"ok","ai_configured":bool}` | 200 |
| POST | `/api/extract` | Multipart `text` and/or `file` → `{transactions, notes, validation_errors, count}` | 400, 413, 422, 502, 503 |
| POST | `/api/chat` | `{message, history, transactions, currency}` → `{reply}` | 400, 422, 502, 503 |

The server also still contains `GET /api/sample` and the `/api/audits` endpoints from an earlier subscription-audit feature. The page does not use them.

---

## Run the tests

```bash
cd server && npm test     # 65 tests: upload checks, cleaning, guardrails, chat context, Gemini calls (stubbed)
cd client && npm test     # 9 tests: dashboard maths, income handling, merging uploads
cd client && npm run build
```

The tests never call the real Gemini service, so they need no key and no internet.

---

## Customising the interface

| To change | File |
|---|---|
| Colours, fonts, corner radius | top of `client/src/styles.css` (`--radius`, `--radius-sm`, `--font-head`, `--font-body`) |
| Sidebar, page title, footer | `client/src/components/Layout.jsx` |
| Metric cards, chart and category titles | `client/src/components/Dashboard.jsx` |
| Upload box text | `client/src/components/ImportPanel.jsx` |
| Chat welcome text and suggested questions | `client/src/components/ChatPanel.jsx` |
| Browser tab title | `client/index.html` |
| What the AI extracts, categories, chat tone and scope | `server/src/ai/prompts.js` |
| Error messages for rejected files and questions | `server/src/ai/prompts.js`, `server/src/api/extraction.js` |
| Benchmark percentages used for advice | `BENCHMARK_SHARE_OF_INCOME` in `server/src/tools/financeTools.js` |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Could not reach the server at http://localhost:8000" | The server is not running or crashed. Start it with `npm run dev` in `server/` and read its terminal. Check <http://localhost:8000/api/health>. |
| "AI key missing" chip, or "AI is not configured" | Set `AI_API_KEY` in `server/.env` and restart the server. |
| "This model … is no longer available to new users" | Set `AI_MODEL=gemini-3.5-flash-lite` (or `gemini-3.8-flash`) and restart. Check that the terminal prints the model you expect. |
| "Gemini refused the request" | The key is invalid, revoked or lacks access. Create a new key in Google AI Studio. |
| "Gemini rate limit or quota reached" | Free-tier limit. Wait a minute, or use a paid plan. |
| "Gemini took too long to respond" | Try again, use a smaller file, or run `node scripts/check-gemini.js` to compare models. |
| CORS error in the browser console | Use `localhost` or `127.0.0.1`, or add your address to `CLIENT_ORIGIN`. |
| "Port 8000 is already in use" | Set `PORT=8001` in `server/.env`, `SERVER_URL=http://localhost:8001` in `client/.env`, and restart both. |
| Wrong currency or `$` shown | Set `VITE_CURRENCY=INR` in `client/.env` and restart the client. |
| Page opens on port 5174 or higher | Port 5173 was busy. This works; the server accepts any `localhost` port. |

---

## Known limitations

- Single user, local use, no login and no database. Refreshing the page clears the dashboard and chat.
- Transactions cannot be edited in the interface.
- Duplicates are detected only when merchant, date, amount and source line all match exactly.
- Very large or many-page PDFs may be slow or hit Gemini limits; the maximum upload is 12 MB.
- Benchmark ranges are general rules of thumb and do not account for city, family size or commute.
- The assistant does not recommend specific investments, loans or products.