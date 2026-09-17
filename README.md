# Companion AI PoC

Local-first AI companion: an open-weight LLM (GGUF + llama.cpp) keeps character, conversation, memories, story, and relationship state. It does **not** use paid APIs (OpenAI, Anthropic, Gemini, Groq, etc.).

Architecture: [PROJECT.md](PROJECT.md).

**This is not a product.** It does not include voice, images, auth, payments, or cloud inference.

## What you can do

1. Pick or create a fictional character.
2. Chat with streamed replies.
3. Stop and restart the app: the same conversation continues (Postgres).
4. Inspect memories, story, and relationship at `/debug/:conversationId`.
5. Swap the local model without rewriting the character or memory engines.

## Requirements

- Node.js 22+
- pnpm 11+ (`corepack enable`)
- Python 3.12+
- Docker Desktop (Postgres and, on Windows, llama.cpp)
- Git
- ~3 GB of disk for a ~3B Q4 GGUF (not committed to Git)

Verified on Windows 10/11 with PowerShell.

## Clone

```powershell
git clone https://github.com/alerodriguez162/companion-ai-poc.git
cd companion-ai-poc
```

## Install

```powershell
copy .env.example .env
pnpm install
python -m venv apps/ai/.venv
.\apps\ai\.venv\Scripts\Activate.ps1
pip install -e "apps/ai[dev]"
```

Unix/macOS:

```bash
cp .env.example .env
pnpm install
python -m venv apps/ai/.venv
source apps/ai/.venv/bin/activate
pip install -e "apps/ai[dev]"
```

If pnpm blocks build scripts, keep `esbuild` and `prisma` in `pnpm-workspace.yaml` (`allowBuilds`) and run `pnpm install` again.

## Environment variables

Copy `.env.example` → `.env`. **Do not commit `.env`.** The example file has no secrets.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://companion:companion@localhost:5432/companion` | Prisma / Postgres |
| `API_PORT` | `3001` | Node API |
| `AI_SERVICE_URL` | `http://localhost:8000` | API → Python |
| `CORS_ORIGIN` | `*` | Frontend origins (set your Vercel domain in production) |
| `VITE_API_BASE_URL` | empty | Locally Vite proxies `/api`. On Vercel: public API URL, no trailing slash |
| `LLM_BASE_URL` | `http://localhost:8080` | llama.cpp server |
| `LLM_MODEL_PATH` | `./models/model.gguf` | GGUF path (in Docker: `/models/model.gguf`) |
| `LLM_CONTEXT_SIZE` | `8192` | Model context |
| `LLM_TEMPERATURE` | `0.7` | Sampling |
| `LLM_MAX_TOKENS` | `512` | Generation cap |
| `LLM_TIMEOUT_SECONDS` | `120` | HTTP timeout to the model |
| `RECENT_MESSAGE_LIMIT` | `20` | Recent messages sent to the LLM (not the full history) |
| `MEMORY_EXTRACTION_INTERVAL` | `10` | Extract memories every N messages (also after the first exchange) |
| `MEMORY_RETRIEVAL_LIMIT` | `8` | Memories injected per turn |
| `LOG_LEVEL` | `info` | JSON logs |
| `DEBUG_PROMPT_LOGGING` | `false` | If `true`, may log prompts (development only) |

Inside Docker, the `ai` service ignores `localhost` from `.env` and uses `http://host.docker.internal:8080`.

## Model (GGUF)

`.gguf` files are **not in Git**. Put them in `./models/`.

Local PoC model: **Qwen2.5-3B-Instruct Q4_K_M** (~2.1 GB).

```powershell
.\apps\ai\.venv\Scripts\Activate.ps1
pip install huggingface_hub
python -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id='Qwen/Qwen2.5-3B-Instruct-GGUF', filename='qwen2.5-3b-instruct-q4_k_m.gguf', local_dir='models')"
copy models\qwen2.5-3b-instruct-q4_k_m.gguf models\model.gguf
```

The `llm` container and `.env` expect **`models/model.gguf`**. If you use another filename, change `LLM_MODEL_PATH` and the `llm` `command` in `docker-compose.yml`.

To compare models later: another GGUF (4B–8B, Q4/Q5/Q8), same `LLM_BASE_URL`, restart llama.cpp and the AI service.

## Database

```powershell
docker compose up postgres -d
$env:DATABASE_URL="postgresql://companion:companion@localhost:5432/companion"
pnpm db:migrate
pnpm db:seed
```

This creates the `pgvector` extension, tables, and two seed characters:

- **Mira Ellison** — warm, curious, informal
- **Calder Voss** — terse, formal, dry

## Local startup (recommended on Windows)

Four processes besides Postgres: llama.cpp, AI, API, web.

### 1. llama.cpp

With Docker Desktop (CPU):

```powershell
docker compose --profile llm up -d llm
```

Image: `ghcr.io/ggml-org/llama.cpp:server`. The first GGUF load can take ~10–30s. Check:

```powershell
curl.exe http://127.0.0.1:8080/health
```

It should return `{"status":"ok"}`.

If you have a native `llama-server` (better when a GPU is available):

```powershell
llama-server -m .\models\model.gguf --host 127.0.0.1 --port 8080 -c 8192
```

### 2. AI service (Python)

```powershell
.\apps\ai\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --app-dir apps/ai --port 8000
```

### 3. API (Node)

```powershell
pnpm --filter @companion/shared --filter @companion/character-engine --filter @companion/memory-engine build
pnpm dev:api
```

### 4. Frontend

```powershell
pnpm dev:web
```

Open **http://localhost:5173** in Chrome or Edge.

### Health

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:3001/health |
| API + DB + AI + LLM | http://localhost:3001/api/health |
| AI | http://localhost:8000/health |
| LLM via AI | http://localhost:8000/health/llm |
| llama.cpp | http://localhost:8080/health |

When everything is up, `GET /api/health` looks like:

```json
{"status":"ok","service":"api","database":"ok","ai":"ok","llm":{"status":"ok","service":"llm","model":"model.gguf"}}
```

## Using the app

1. **Character selection** (`/`): Mira or Calder, or create one at `/characters/new`.
2. **Chat** (`/chat/:characterId`): type a message and wait for the stream. On CPU a 3B model can take several seconds to the first token.
3. **Debug** (“Open debug” or `/debug/:conversationId`): character context, relationship, story, stored memories, memories retrieved for the last turn, approximate context size, and latency metrics.

Memories are not raw sentences: the model extracts facts (a dog named Toto, promises, and so on). Retrieval mixes lexical similarity (or embeddings if llama.cpp provides them), importance, and recency.

## Full Docker stack

Postgres + API + AI + web:

```powershell
copy .env.example .env
# models/model.gguf must exist
docker compose up --build
```

llama.cpp as well:

```powershell
docker compose --profile llm up -d
```

The Docker frontend is http://localhost:5173 (nginx → API). The AI container talks to llama.cpp on the host via `host.docker.internal:8080`.

## Tests

```powershell
pnpm typecheck
pnpm test
pnpm build
.\apps\ai\.venv\Scripts\Activate.ps1
pytest apps/ai
```

## Evaluation scenarios

With API, AI, Postgres, and llama.cpp running:

```powershell
.\apps\ai\.venv\Scripts\Activate.ps1
python evals/conversation-simulator/simulate.py
```

Scenarios live in `evals/scenarios/`. JSON results go to `evals/results/` (gitignored).

- **memoryRecall**: fraction of `expectContains` probes found in the reply (case-insensitive substring).
- Character consistency and story continuity are mostly manual; use the debug page.

## Changing models

1. Place the new GGUF in `./models/` (or change `LLM_MODEL_PATH`).
2. Restart llama.cpp (`docker compose --profile llm up -d --force-recreate llm` or the native binary).
3. Restart the AI service.
4. Eval JSON includes model metadata after a recent generation.

Do not hardcode the model filename in application code.

## Frontend on Vercel

Vercel serves **only** the React app (`vercel.json`). It cannot run llama.cpp, FastAPI, or Postgres.

1. Import this repo in Vercel (monorepo root).
2. Build: `vercel.json` already runs `pnpm install` and builds `@companion/web`.
3. Build env: `VITE_API_BASE_URL=https://your-api.example.com` (no trailing slash).
4. On the API host: `CORS_ORIGIN=https://your-app.vercel.app`.

Without a public API, use http://localhost:5173.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `llm: unavailable` | `llm` container, `models/model.gguf`, port 8080, `curl http://127.0.0.1:8080/health` |
| Chat error / timeout | First model load; slow CPU; raise `LLM_TIMEOUT_SECONDS` |
| `database: unavailable` | `docker compose up postgres -d` and `pnpm db:migrate` |
| Empty character list | `pnpm db:seed` |
| pnpm `IGNORED_BUILDS` | `pnpm approve-builds` for `esbuild` and `prisma` |
| llama.cpp image 404 | Use `ghcr.io/ggml-org/llama.cpp:server`, not the old `ggerganov` tag |
| Internal preview stuck on Loading | Open Chrome/Edge at http://localhost:5173 |
| Docker Desktop “engine not running” | Start Docker Desktop and wait until the Linux engine is ready |

To stop the PoC: Ctrl+C on API/AI/web, then `docker compose --profile llm stop` (Postgres and llama.cpp).
