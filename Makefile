.PHONY: help up down ps logs logs-backend clean lint-be test-be typecheck-fe check

# Variables
COMPOSE = docker compose
FRONTEND_DIR = frontend
FRONTEND_NPM = cd $(FRONTEND_DIR) && npm
BACKEND_DIR = backend
BACKEND_CD = cd $(BACKEND_DIR) &&

help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

up: ## Start environment, full stack
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
