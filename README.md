# Companion AI PoC

Companion de IA **local-first**: un LLM de pesos abiertos (GGUF + llama.cpp) mantiene personaje, conversación, recuerdos, historia y relación. No usa APIs de pago (OpenAI, Anthropic, Gemini, Groq, etc.).

Arquitectura detallada: [PROJECT.md](PROJECT.md).

**Esto no es un producto.** No incluye voz, imágenes, auth, pagos ni despliegue de inferencia en la nube.

## Qué puedes hacer

1. Elegir o crear un personaje de ficción.
2. Chatear con respuestas en streaming.
3. Parar y volver a abrir la app: la conversación sigue (Postgres).
4. Ver recuerdos, historia y relación en `/debug/:conversationId`.
5. Cambiar de modelo local sin reescribir el motor de personaje/memoria.

## Requisitos

- Node.js 22+
- pnpm 11+ (`corepack enable`)
- Python 3.12+
- Docker Desktop (Postgres y, en Windows, llama.cpp)
- Git
- ~3 GB de disco para un GGUF Q4 de ~3B (no se sube a Git)

Comprobado en Windows 10/11 con PowerShell.

## Clonar

```powershell
git clone https://github.com/alerodriguez162/companion-ai-poc.git
cd companion-ai-poc
```

## Instalación

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

Si pnpm pide aprobar scripts de build, deja `esbuild` y `prisma` en `pnpm-workspace.yaml` (`allowBuilds`) y vuelve a `pnpm install`.

## Variables de entorno

Copia `.env.example` → `.env`. **No subas `.env`.** No hay secretos en el ejemplo.

| Variable | Default | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://companion:companion@localhost:5432/companion` | Prisma / Postgres |
| `API_PORT` | `3001` | API Node |
| `AI_SERVICE_URL` | `http://localhost:8000` | API → Python |
| `CORS_ORIGIN` | `*` | Orígenes del frontend (pon tu dominio Vercel en prod) |
| `VITE_API_BASE_URL` | vacío | En local Vite hace proxy de `/api`. En Vercel: URL pública de la API, sin `/` final |
| `LLM_BASE_URL` | `http://localhost:8080` | Servidor llama.cpp |
| `LLM_MODEL_PATH` | `./models/model.gguf` | Ruta del GGUF (en Docker: `/models/model.gguf`) |
| `LLM_CONTEXT_SIZE` | `8192` | Contexto del modelo |
| `LLM_TEMPERATURE` | `0.7` | Muestreo |
| `LLM_MAX_TOKENS` | `512` | Tope de generación |
| `LLM_TIMEOUT_SECONDS` | `120` | Timeout HTTP al modelo |
| `RECENT_MESSAGE_LIMIT` | `20` | Mensajes recientes al LLM (no manda todo el historial) |
| `MEMORY_EXTRACTION_INTERVAL` | `10` | Extrae recuerdos cada N mensajes (también tras el primer intercambio) |
| `MEMORY_RETRIEVAL_LIMIT` | `8` | Recuerdos inyectados por turno |
| `LOG_LEVEL` | `info` | Logs JSON |
| `DEBUG_PROMPT_LOGGING` | `false` | Si `true`, puede loguear prompts (solo desarrollo) |

Dentro de Docker, el servicio `ai` ignora `localhost` del `.env` y usa `http://host.docker.internal:8080`.

## Modelo (GGUF)

Los `.gguf` **no van a Git**. Colócalos en `./models/`.

Modelo usado en el PoC local: **Qwen2.5-3B-Instruct Q4_K_M** (~2.1 GB).

```powershell
.\apps\ai\.venv\Scripts\Activate.ps1
pip install huggingface_hub
python -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id='Qwen/Qwen2.5-3B-Instruct-GGUF', filename='qwen2.5-3b-instruct-q4_k_m.gguf', local_dir='models')"
copy models\qwen2.5-3b-instruct-q4_k_m.gguf models\model.gguf
```

El contenedor `llm` y `.env` esperan el archivo **`models/model.gguf`**. Si usas otro nombre, cambia `LLM_MODEL_PATH` y el `command` de `llm` en `docker-compose.yml`.

Para comparar modelos más adelante: otro GGUF (4B–8B, Q4/Q5/Q8), mismo `LLM_BASE_URL`, reinicia llama.cpp y el servicio AI.

## Base de datos

```powershell
docker compose up postgres -d
$env:DATABASE_URL="postgresql://companion:companion@localhost:5432/companion"
pnpm db:migrate
pnpm db:seed
```

Crea la extensión `pgvector`, las tablas y dos personajes:

- **Mira Ellison** — cercana, curiosa, informal
- **Calder Voss** — seco, formal, irónico

## Arranque local (recomendado en Windows)

Cuatro piezas: Postgres (ya arriba), llama.cpp, AI, API, web.

### 1. llama.cpp

Con Docker Desktop (CPU):

```powershell
docker compose --profile llm up -d llm
```

Imagen: `ghcr.io/ggml-org/llama.cpp:server`. La primera carga del GGUF puede tardar ~10–30 s. Comprueba:

```powershell
curl.exe http://127.0.0.1:8080/health
```

Debe devolver `{"status":"ok"}`.

Si tienes `llama-server` nativo (mejor si hay GPU):

```powershell
llama-server -m .\models\model.gguf --host 127.0.0.1 --port 8080 -c 8192
```

### 2. Servicio AI (Python)

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

Abre **http://localhost:5173** en Chrome o Edge.

### Health

| Servicio | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:3001/health |
| API + DB + AI + LLM | http://localhost:3001/api/health |
| AI | http://localhost:8000/health |
| LLM vía AI | http://localhost:8000/health/llm |
| llama.cpp | http://localhost:8080/health |

`GET /api/health` debería verse así cuando todo va bien:

```json
{"status":"ok","service":"api","database":"ok","ai":"ok","llm":{"status":"ok","service":"llm","model":"model.gguf"}}
```

## Cómo usar la app

1. **Character selection** (`/`): Mira o Calder, o crea uno en `/characters/new`.
2. **Chat** (`/chat/:characterId`): escribe y espera el stream. En CPU un 3B puede tardar varios segundos en el primer token.
3. **Debug** (enlace “Open debug” o `/debug/:conversationId`): contexto de personaje, relación, historia, recuerdos, recuerdos recuperados del último turno, tamaño aproximado de contexto y métricas de latencia.

Los recuerdos no copian cada frase: el modelo extrae hechos (perro Toto, promesas, etc.) y el retrieval mezcla similitud léxica (o embeddings si llama.cpp los ofrece), importancia y recencia.

## Docker de toda la pila

Postgres + API + AI + web:

```powershell
copy .env.example .env
# models/model.gguf debe existir
docker compose up --build
```

llama.cpp extra:

```powershell
docker compose --profile llm up -d
```

El frontend Docker queda en http://localhost:5173 (nginx → API). El AI en contenedor habla con llama.cpp en el host vía `host.docker.internal:8080`.

## Tests

```powershell
pnpm typecheck
pnpm test
pnpm build
.\apps\ai\.venv\Scripts\Activate.ps1
pytest apps/ai
```

## Evaluaciones largas

Con API, AI, Postgres y llama.cpp en marcha:

```powershell
.\apps\ai\.venv\Scripts\Activate.ps1
python evals/conversation-simulator/simulate.py
```

Escenarios en `evals/scenarios/`. Resultados JSON en `evals/results/` (gitignored).

- **memoryRecall**: fracción de `expectContains` que aparecen en la respuesta (substring, sin mayúsculas).
- Consistencia de personaje y continuidad de historia: en gran parte manual; mira el debug.

## Cambiar de modelo

1. Pon el nuevo GGUF en `./models/` (o cambia `LLM_MODEL_PATH`).
2. Reinicia llama.cpp (`docker compose --profile llm up -d --force-recreate llm` o el binario nativo).
3. Reinicia el servicio AI.
4. Los JSON de eval incluyen metadatos de modelo cuando hay una generación reciente.

No hardcodees el nombre del fichero en el código.

## Frontend en Vercel

Vercel **solo** sirve el React (`vercel.json`). No puede ejecutar llama.cpp, FastAPI ni Postgres.

1. Importa este repo en Vercel (raíz del monorepo).
2. Build: el `vercel.json` ya define `pnpm install` y el build de `@companion/web`.
3. Variable de build: `VITE_API_BASE_URL=https://tu-api.ejemplo.com` (sin slash final).
4. En el host de la API: `CORS_ORIGIN=https://tu-app.vercel.app`.

Sin API pública, usa http://localhost:5173.

## Problemas frecuentes

| Síntoma | Qué revisar |
| --- | --- |
| `llm: unavailable` | Contenedor `llm`, `models/model.gguf`, puerto 8080, `curl http://127.0.0.1:8080/health` |
| Chat error / timeout | Primera carga del modelo; CPU lenta; sube `LLM_TIMEOUT_SECONDS` |
| `database: unavailable` | `docker compose up postgres -d` y `pnpm db:migrate` |
| Lista de personajes vacía | `pnpm db:seed` |
| pnpm `IGNORED_BUILDS` | `pnpm approve-builds` para `esbuild` y `prisma` |
| Imagen llama.cpp 404 | Usa `ghcr.io/ggml-org/llama.cpp:server`, no el tag viejo `ggerganov` |
| Preview interno en negro / Loading infinito | Abre Chrome/Edge en http://localhost:5173 |
| Docker Desktop “engine not running” | Abre Docker Desktop y espera a que el motor Linux esté listo |

Para parar el PoC: Ctrl+C en API/AI/web, y `docker compose --profile llm stop` (Postgres y llama.cpp).
