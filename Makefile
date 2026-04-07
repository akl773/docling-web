.PHONY: help up down ps logs logs-backend clean lint-be test-be typecheck-fe check dev dev-be dev-fe

# Variables
COMPOSE = docker compose
FRONTEND_DIR = frontend
FRONTEND_NPM = cd $(FRONTEND_DIR) && npm
BACKEND_DIR = backend
BACKEND_CD = cd $(BACKEND_DIR) &&
VENV_PYTHON = $(CURDIR)/.venv/bin/python
DEV_DATA_DIR = $(CURDIR)/.dev-data

help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ── Development (hot reload) ────────────────────
dev: ## Start both frontend and backend with hot reload
	@mkdir -p $(DEV_DATA_DIR)
	@make -j2 dev-be dev-fe

dev-be: ## Start backend with hot reload (uvicorn --reload)
	@mkdir -p $(DEV_DATA_DIR)
	@test -x "$(VENV_PYTHON)" || (printf "Missing project virtualenv at %s\nRun: python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt\n" "$(VENV_PYTHON)" && exit 1)
	DATABASE_URL="sqlite:///$(DEV_DATA_DIR)/app.db" \
	DATA_DIR="$(DEV_DATA_DIR)" \
	FRONTEND_DIST_DIR="$(CURDIR)/$(FRONTEND_DIR)/dist" \
	MAX_CONCURRENT_JOBS="1" \
	OMP_NUM_THREADS="4" \
	$(VENV_PYTHON) -m uvicorn app.main:app --app-dir $(BACKEND_DIR) --reload --host 0.0.0.0 --port 8176

dev-fe: ## Start frontend with Vite HMR
	$(FRONTEND_NPM) run dev

# ── Docker (production-like) ─────────────────────
up: ## Start environment, full stack (Docker)
	$(COMPOSE) up -d --build

down: ## Stop environment
	$(COMPOSE) down

ps: ## Show containers status
	$(COMPOSE) ps

logs: ## View all logs
	$(COMPOSE) logs -f

logs-backend: ## View backend logs
	$(COMPOSE) logs -f app

clean: ## Clean up containers, volumes, orphans
	$(COMPOSE) down -v --remove-orphans

lint-be: ## Lint backend
	python -m ruff check $(BACKEND_DIR) && python -m ruff format --check $(BACKEND_DIR)

test-be: ## Run backend tests
	$(BACKEND_CD) python -m pytest

typecheck-fe: ## TypeScript type check frontend
	$(FRONTEND_NPM) exec tsc -- -b

check: ## Typecheck frontend and backend tests (parallel)
	make -j typecheck-fe test-be
