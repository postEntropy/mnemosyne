# Mnemosyne

Mnemosyne is an AI-powered screenshot memory system inspired by the Microsoft Recall idea.
It watches a screenshot folder, analyzes images with a vision model, stores structured metadata in SQLite, and exposes everything through a FastAPI backend + React frontend.

## Why This Project

- Automatic screenshot ingestion from a watched folder
- AI enrichment (description, app name, tags, summary)
- Searchable timeline with filters and stats
- Local-first architecture with optional cloud inference

## Tech Stack

- Backend: FastAPI, SQLAlchemy (async), Alembic, Watchdog, Pillow
- Frontend: React + Vite + Tailwind CSS
- Database: SQLite
- AI Providers:
  - Ollama (local)
  - OpenRouter (cloud)

## Repository Layout

```text
mnemosyne/
├── backend/
│   ├── app/
│   ├── migrations/
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   └── package.json
├── check_back.py
├── reset_db.py
├── reset_pending.py
└── test_backend.py
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- npm 9+
- Optional for local AI mode: Ollama running locally

## Quick Start

### 1. Clone

```bash
git clone <your-repo-url>
cd mnemosyne
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set at least:

- `SCREENSHOTS_DIR` to a valid folder on your machine
- `AI_PROVIDER` to `ollama` or `openrouter`
- If `openrouter`: set `OPENROUTER_API_KEY`
- If `ollama`: ensure `OLLAMA_BASE_URL` and `OLLAMA_MODEL` are valid

Start backend:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies API calls to backend `http://localhost:8000`.

## Configuration

Main environment variables (`backend/.env`):

- `SCREENSHOTS_DIR` (default in code: `~/Pictures/Screenshots`)
- `THUMBNAILS_DIR` (default: `./thumbnails`)
- `AI_PROVIDER` (`ollama` or `openrouter`)
- `OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `llava`)
- `OPENROUTER_API_KEY` (required for OpenRouter)
- `OPENROUTER_MODEL`
- `DATABASE_URL` (default: `sqlite+aiosqlite:///./mnemosyne.db`)
- `API_HOST` / `API_PORT`

## Running Health Checks

Backend health endpoint:

```bash
curl http://localhost:8000/api/health
```

Optional project script:

```bash
python check_back.py
```

## Common Issues

### No screenshots are processed

- Verify `SCREENSHOTS_DIR` exists and contains images
- Confirm backend logs do not show watcher errors
- If using Ollama:
  - Confirm Ollama is running
  - Confirm the configured model exists locally

### Frontend loads but images fail to open

- Ensure backend is reachable at `http://localhost:8000`
- Confirm the file path still exists on disk

### OpenRouter test fails

- Validate `OPENROUTER_API_KEY`
- Confirm outbound internet access

## Security Notes

- Never commit real `.env` files
- Rotate API keys immediately if they were ever exposed
- This repository uses `.gitignore` rules for local env/db/cache artifacts

## Test and Utility Scripts

From project root:

```bash
python test_backend.py
python test_single.py
python reset_db.py
python reset_pending.py
```

## Production Notes

Current setup is optimized for local development and experimentation.
For production usage, add:

- stricter CORS policy
- reverse proxy and TLS
- process manager for backend/frontend
- external database if needed
- secrets manager for API keys

## License

Add your preferred license (MIT, Apache-2.0, etc.) before publishing.
