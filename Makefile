.PHONY: help dev dev-down dev-logs dev-logs-backend up down ps logs logs-backend clean

# Variables
COMPOSE = docker compose

help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ── Development (hot reload via Docker) ──────────
dev: ## Start dev environment with hot reload (Docker)
	$(COMPOSE) -f docker-compose.dev.yml up --build

dev-down: ## Stop dev environment
	$(COMPOSE) -f docker-compose.dev.yml down

dev-logs: ## View dev logs
	$(COMPOSE) -f docker-compose.dev.yml logs -f

dev-logs-backend: ## View dev backend logs
	$(COMPOSE) -f docker-compose.dev.yml logs -f backend

# ── Docker (production-like) ─────────────────────
up: ## Start environment, full stack (Docker)
	$(COMPOSE) up -d --build

down: ## Stop environment
	-$(COMPOSE) -f docker-compose.dev.yml down
	-$(COMPOSE) down

ps: ## Show containers status
	$(COMPOSE) ps

logs: ## View all logs
	$(COMPOSE) logs -f

logs-backend: ## View backend logs
	$(COMPOSE) logs -f app

clean: ## Clean up containers, volumes, orphans
	-$(COMPOSE) -f docker-compose.dev.yml down -v --remove-orphans
	-$(COMPOSE) down -v --remove-orphans
