# Docling Web

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.116+-green.svg)](https://fastapi.tiangolo.com/)
[![Docling](https://img.shields.io/badge/Docling-2.84-purple.svg)](https://github.com/DS4SD/docling)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://hub.docker.com/r/akl49879/docling-web)

> A self-hosted web interface for [Docling](https://github.com/DS4SD/docling) that converts PDFs to Markdown with OCR and table extraction, packaged as a single Docker container.

[Docker Hub](https://hub.docker.com/r/akl49879/docling-web) · [API Docs (local)](http://localhost:8176/api/docs) · [Report an Issue](https://github.com/akl773/docling-web/issues)

## Overview

Docling Web wraps the Docling document-conversion library in a production-ready
web application. Upload PDFs through a batch-capable UI, track conversion
progress in real time, and download the extracted Markdown — all without
configuring Python environments or ML dependencies on your host machine.

## Why It Exists

Running Docling locally requires installing heavy ML dependencies, managing
model caches, and writing glue code for batch processing. Docling Web solves
this by packaging everything into a single Docker image with a polished
frontend, persistent job queue, and zero host-side setup.

## Screenshots

### Batch Upload
Queue PDFs with shared and per-file settings for OCR, table extraction, and image handling.

![Batch Upload](docs/images/batch-upload.png)

### Active Jobs
Monitor queued and processing jobs, inspect the original PDF alongside the generated Markdown.

![Active Jobs](docs/images/active-jobs.png)

## Core Capabilities

- Batch PDF upload with shared defaults and per-file setting overrides
- Real-time job progress tracking (queued → processing → serializing → bundling → done)
- Side-by-side PDF source and Markdown result viewer
- Individual file download or full batch ZIP export
- Persistent SQLite-backed job queue with automatic retry isolation (failed jobs don't block the batch)
- Docling ML model cache persisted across container restarts

## Tech Stack

- **Backend:** FastAPI, Python 3.11, SQLAlchemy, Uvicorn
- **Frontend:** React 19, TypeScript, Vite, TanStack Query
- **Data:** SQLite (`app.db`)
- **AI:** Docling 2.84 (OCR, table structure, layout analysis)
- **Infra:** Docker, Docker Compose, GitHub Actions (Docker Hub publish)

## Architecture

```text
┌─────────────────────────────────────────────────┐
│                  Docker Container                │
│                                                  │
│  ┌──────────────┐       ┌─────────────────────┐  │
│  │  React SPA   │──────▶│   FastAPI (Uvicorn)  │  │
│  │  (static)    │       │     port 8176        │  │
│  └──────────────┘       └──────┬──────────────┘  │
│                                │                  │
│                    ┌───────────┼───────────┐      │
│                    ▼           ▼           ▼      │
│              ┌──────────┐ ┌────────┐ ┌─────────┐ │
│              │  Worker   │ │ SQLite │ │ Storage │ │
│              │Coordinator│ │ (queue)│ │ (files) │ │
│              └─────┬─────┘ └────────┘ └─────────┘ │
│                    │                               │
│                    ▼                               │
│              ┌──────────┐                          │
│              │  Docling  │                          │
│              │  (ML)     │                          │
│              └──────────┘                          │
│                                                    │
│  Volumes: /data (uploads, results, bundles, db)    │
│           ~/.cache/docling (ML model cache)        │
└────────────────────────────────────────────────────┘
```

The application runs as a **modular monolith** in a single container. Uvicorn
serves both the FastAPI API endpoints and the compiled React SPA as static
files. An in-process `WorkerCoordinator` polls the SQLite queue and dispatches
conversion jobs to Docling. Docker volumes persist application data and the ML
model cache across restarts.

## Project Structure

```text
docling-web/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app factory and API routes
│   │   ├── config.py            # Pydantic settings (env vars)
│   │   ├── models.py            # SQLAlchemy ORM models
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── repositories.py      # Database query layer
│   │   ├── database.py          # Engine and session management
│   │   ├── storage.py           # File system storage manager
│   │   └── services/
│   │       ├── worker.py        # Background job coordinator
│   │       ├── docling_adapter.py  # Docling conversion wrapper
│   │       └── bundler.py       # ZIP bundle builder
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Root application component
│   │   ├── components/          # Reusable UI components
│   │   ├── routes/              # Page-level route components
│   │   ├── lib/                 # API client and utilities
│   │   └── styles.css           # Global styles
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── docs/images/                 # Screenshots for README
├── docker-compose.yml           # Production compose
├── docker-compose.dev.yml       # Dev compose (hot reload)
├── Dockerfile                   # Multi-stage production build
├── Dockerfile.dev               # Development build targets
├── Makefile                     # Project task runner
└── README.md
```

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### Quick Start (Docker Hub)

Pull and run the pre-built image:

```bash
docker run -d \
  -p 6176:8176 \
  -v docling-data:/data \
  -v docling-cache:/root/.cache/docling \
  akl49879/docling-web:latest
```

Open [http://localhost:6176](http://localhost:6176) in your browser.

### Quick Start (Docker Compose)

```bash
git clone https://github.com/akl773/docling-web.git
cd docling-web
make up
```

| URL | Purpose |
|-----|---------|
| [http://localhost:6176](http://localhost:6176) | Web interface |
| [http://localhost:8176/api/docs](http://localhost:8176/api/docs) | Swagger API documentation |

## Configuration

All environment variables are set in `docker-compose.yml` (or `docker-compose.dev.yml` for development). No `.env` file is required by default.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `sqlite:////data/app.db` | SQLite connection string |
| `DATA_DIR` | Yes | `/data` | Root path for uploads, results, and bundles |
| `OMP_NUM_THREADS` | No | `4` | Thread count for PyTorch / Docling inference |
| `MAX_CONCURRENT_JOBS` | No | `1` | Max parallel background conversion workers |
| `FRONTEND_DIST_DIR` | No | `/app/frontend-dist` | Path to compiled React SPA assets |
| `PYTHONUNBUFFERED` | No | `1` | Disable Python output buffering |

## Running the Project

```bash
# Production (detached)
make up

# Development with hot reload (backend + frontend)
make dev

# Stop
make down

# View logs
make logs

# Clean up containers and volumes
make clean
```

## Usage

1. Open the web UI at [http://localhost:6176](http://localhost:6176).
2. Drag and drop one or more PDF files onto the upload area.
3. Configure shared conversion settings (OCR, table extraction, image handling) or set per-file overrides.
4. Submit the batch. The UI tracks progress through stages: **queued → processing → serializing → bundling → done**.
5. Click a completed job to view the original PDF alongside the extracted Markdown.
6. Download individual Markdown files or the entire batch as a ZIP.

> The first conversion takes longer because Docling downloads ML models
> (~1–2 GB) into the persistent `docling_cache` volume. Subsequent runs
> use the cached models.

## API Summary

The backend exposes a RESTful API under `/api`. Full interactive docs are
available at `/api/docs` (Swagger UI) and `/api/redoc` (ReDoc).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/batches` | Upload PDFs and create a conversion batch |
| `GET` | `/api/batches` | List all batches |
| `GET` | `/api/batches/{id}` | Get batch details |
| `GET` | `/api/batches/{id}/download` | Download batch results as ZIP |
| `GET` | `/api/jobs` | List jobs (optionally filter by `?status=`) |
| `GET` | `/api/jobs/{id}` | Get job details |
| `GET` | `/api/jobs/{id}/source` | View original PDF |
| `GET` | `/api/jobs/{id}/markdown` | View extracted Markdown |
| `GET` | `/api/jobs/{id}/download` | Download Markdown file |

## Development Workflow

```bash
make help       # Show all available Makefile targets
make dev        # Start dev environment with hot reload (Docker)
make up         # Start production-like environment (Docker)
make down       # Stop environment
make ps         # Show container status
make logs       # Follow all logs
make logs-backend  # Follow backend logs only
make clean      # Remove containers and volumes
```

The dev environment (`make dev`) uses `docker-compose.dev.yml` which:
- Mounts `backend/app/` for live Python reload
- Mounts `frontend/src/` for Vite HMR
- Runs the frontend dev server on port 6176 with an API proxy to the backend on port 8176

## Deployment

The project ships with a GitHub Actions workflow that publishes to Docker Hub
on every tagged release (`v*`):

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers `.github/workflows/docker-publish.yml`, which builds the
multi-stage Dockerfile and pushes both the version tag and `latest` to
[`akl49879/docling-web`](https://hub.docker.com/r/akl49879/docling-web).

## Contributing

1. Fork the repository.
2. Create a feature branch from `main`.
3. Make changes and verify with `make dev`.
4. Open a pull request.
