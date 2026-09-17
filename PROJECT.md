# Companion AI PoC — Architecture

**Status:** Chat-capable PoC (phases 2–10 implemented). Local llama.cpp + Postgres required for a full conversation. Frontend can be deployed to Vercel; the API/AI/LLM stack cannot.

This document is the architectural source of truth. Read it before changing code.

---

## Goal

Validate whether an **open-weight LLM running locally** (no paid AI APIs) can:

- Maintain a configurable fictional character/persona
- Keep conversational context without sending the full history
- Remember important facts across sessions
- Retrieve relevant long-term memories
- Maintain story continuity and relationship state
- Stream responses to the frontend
- Resume a conversation after restart
- Be evaluated automatically for memory and character consistency

This is a **proof of concept**, not a production product.

---

## Non-goals

Not in this PoC (keep seams open, do not build them now):

- Image generation, voice, STT/TTS
- Mobile (React Native, iOS, Android)
- Payments, subscriptions, auth providers, social login
- Production deployment, Kubernetes
- Fine-tuning, LoRA/QLoRA, training
- Cloud LLM APIs (OpenAI, Anthropic, Gemini, Groq, Together, Replicate, etc.)
- NSFW-specific features (the architecture stays generic)

---

## Architecture

Clear process boundaries:

| Layer | Location | Responsibility |
| --- | --- | --- |
| Frontend | `apps/web` | Character select/create, chat UI, debug UI |
| Application backend | `apps/api` | Persistence, validation, SSE proxy to AI, no model-specific logic |
| AI orchestration | `apps/ai` | Prompts, memory extraction/retrieval, story/relationship updates, LLM provider |
| Model inference | llama.cpp server | Local GGUF generation/embeddings |
| Persistence | PostgreSQL + pgvector | Characters, conversations, memories, story/relationship state |
| Evaluation | `evals/` | Scripted long conversations and metrics |

Rules:

- **Node must not** contain LLM-specific implementation (no llama.cpp client, no prompt templates for generation).
- **Python must not** contain application authentication or frontend business logic.
- **Character Engine** and **Memory Engine** are pure TypeScript packages. They do not call the LLM or HTTP.
- The **model is replaceable** via `LLM_BASE_URL` / `LLM_MODEL_PATH` and the `LLMProvider` abstraction.

```
Browser → React (Vite)
        → Node/Express API
        → Python FastAPI (orchestration)
        → llama.cpp (OpenAI-compatible local HTTP)
        → PostgreSQL
```

PHASE 1 implements process skeletons and `/health` only. The API does not call the AI service for generation yet.

---

## Data flow

Target chat flow (PHASE 5+):

1. User submits a message in `/chat/:characterId`.
2. API validates and persists the USER message.
3. API loads character, relationship state, story state, recent messages.
4. API asks the AI service to retrieve relevant memories (or retrieves via a dedicated AI endpoint).
5. AI `ContextBuilder` assembles a strictly sectioned prompt.
6. AI streams tokens from `LLMProvider.stream`.
7. API forwards SSE to the browser.
8. On completion, API persists the ASSISTANT message.
9. Async: memory extraction and story-state update after `MEMORY_EXTRACTION_INTERVAL` new messages.

Resume-after-restart: all messages and state live in PostgreSQL, not in process memory.

**PHASE 1:** each service answers `GET /health`. No chat data flow yet.

---

## Directory structure

```
companion-ai-poc/
  apps/
    web/                 React + Vite + TypeScript
    api/                 Node + Express + TypeScript
    ai/                  Python 3.12 + FastAPI
  packages/
    shared/              Shared types (no I/O)
    character-engine/    Character → structured context (pure)
    memory-engine/       Memory scoring/retrieval helpers (pure)
  evals/
    conversation-simulator/
    scenarios/
    results/
  models/                Local GGUF files (not committed)
  docker-compose.yml
  .env.example
  PROJECT.md
  README.md
```

pnpm workspaces cover `apps/web`, `apps/api`, and `packages/*`. Python is independent under `apps/ai`.

---

## Database schema (planned, PHASE 2)

PostgreSQL with `pgvector` when available. All IDs are UUIDs.

**Character**

- `id`, `name`, `description`, `personality`, `background`, `speakingStyle`, `scenario`
- `traits` JSON (e.g. humor/sarcasm/affection/curiosity as 0–1 numbers; not hardcoded into prompt source)
- `createdAt`, `updatedAt`

**Conversation**

- `id`, `characterId`, `createdAt`, `updatedAt`

**Message**

- `id`, `conversationId`, `role` (`USER` | `ASSISTANT` | `SYSTEM`), `content`, `createdAt`
- optional `tokenCount`, `metadata` JSON

**Memory**

- `id`, `conversationId` and/or `characterId`
- `type`: `USER_FACT` | `CHARACTER_FACT` | `RELATIONSHIP_EVENT` | `STORY_EVENT` | `PREFERENCE` | `PROMISE` | `IMPORTANT_EVENT`
- `content`, `importance` (0–1), `embedding` vector (nullable until embeddings land)
- `createdAt`, `updatedAt`

**StoryState** (one current row per conversation)

- `currentScene`, `location`, `participants`, `activeEvents`, `openThreads`, `timelineSummary`
- persisted JSON with Pydantic/Zod validation before write

**RelationshipState** (one per conversation)

- `affinity`, `trust` bounded integers
- `relationshipStage`: `STRANGER` | `ACQUAINTANCE` | `FRIEND` | `CLOSE_FRIEND`
- updates are clamped and rate-limited (no jump 10 → 100 in one turn)

Prisma lives in `apps/api`. Vector columns may use `Unsupported("vector")` plus parameterized SQL if Prisma cannot express pgvector cleanly.

---

## AI orchestration

Python FastAPI owns:

- Prompt/context construction (`ContextBuilder`)
- Model communication via `LLMProvider`
- Memory extraction (structured JSON → Pydantic; parse failures are logged, never crash the chat)
- Memory retrieval (top ~5–10, never all memories)
- Story-state extraction
- Conversation summarization
- Evaluation helpers

Inference abstraction (PHASE 1: ABC only; PHASE 3: `LlamaCppProvider`):

```python
class LLMProvider:
    async def generate(...)
    async def stream(...)
    async def embed(...)
```

The rest of the application must not import llama.cpp or assume a single model filename.

Default generation settings (env, overridable):

- `LLM_CONTEXT_SIZE=8192`
- `LLM_TEMPERATURE=0.7`
- `LLM_MAX_TOKENS=512`
- `RECENT_MESSAGE_LIMIT=20`
- `MEMORY_EXTRACTION_INTERVAL=10`
- `MEMORY_RETRIEVAL_LIMIT=8`

Prompt injection: user text, memories, and story fields are **data sections**, never concatenated into executable system instructions. System instructions stay first and isolated.

---

## Memory architecture

**Short-term:** last `RECENT_MESSAGE_LIMIT` messages only.

**Long-term:** extracted facts/events, not raw sentences.

Retrieval score (weights configurable):

```
score = semanticSimilarity * 0.65 + importance * 0.25 + recencyScore * 0.10
```

Embeddings: local model only. If local embeddings delay bootstrap, use a documented lexical + importance + recency fallback, then swap `embed()` behind `LLMProvider`.

Extraction runs asynchronously after the assistant reply when the interval is reached. Malformed model JSON is logged and discarded.

---

## Story-state architecture

Story state is explicit, persisted, and validated. The model may **propose** updates; invalid JSON is ignored. Debug UI shows the current snapshot so we can see why the model answered as it did.

Relationship state is separate from memories. Stages are an enum. Numeric stats use min/max and max-delta per turn.

---

## Evaluation strategy

`evals/conversation-simulator` will drive scripted scenarios (PHASE 10):

- memory-recall
- character-consistency
- story-continuity
- relationship-progression

Metrics written to `evals/results/` as JSON, including model metadata (`model`, `quantization`, `contextSize`) so results are not coupled to one filename.

Subjective metrics (consistency, continuity) must document the scoring method; do not pretend they are fully objective.

Directories and a Python simulator exist. Short scripted scenarios live in `evals/scenarios/`. Results go to `evals/results/`.

---

## Current limitations

- Chat quality depends entirely on the local GGUF; 4B–8B models will miss facts and break character under long context.
- Embeddings use llama.cpp `/v1/embeddings` when available; otherwise retrieval is lexical + importance + recency.
- Evaluation `memoryRecall` is substring matching, not an LLM-as-judge. Consistency/continuity are not fully automatic.
- Vercel can serve `apps/web` only. It cannot run llama.cpp, FastAPI, or Prisma/Postgres.
- Docker image builds require Docker Desktop's engine to be running.
- From Docker, the AI service talks to a host llama.cpp server at `http://host.docker.internal:8080` and reads GGUF files from `/models`.
- pnpm 11 requires `allowBuilds.esbuild: true` in `pnpm-workspace.yaml`.

---

## Future experiments

- Compare 4B vs 8B GGUF models and quantizations (Q4/Q5/Q8)
- Local embedding model vs lexical fallback
- Summarization vs raw recent-window for short-term context
- Memory extraction interval vs recall accuracy
- GPU vs CPU llama.cpp on Windows/macOS (prefer native server when Docker GPU is worse)

---

## Implementation phases

| Phase | Focus |
| --- | --- |
| 0–1 | Repo, docs, scaffolds, Docker, health |
| 2–10 | Schema, engines, chat SSE, memory/story/relationship, debug UI, evals (current) |
| 11 | Broader eval runs across models |

After every phase: build, test, typecheck, update this file if architecture changed, report blockers. Never claim a path works without running it.
