# Development Guide

## Project Layout

- `frontend/`: Vite + React client application.
- `backend/`: Go API module.
- `docker-compose.yml`: MongoDB, Redis, API, and web services.

## Local Validation

Run frontend checks from `frontend/`:

```powershell
npm.cmd run build
```

Run backend checks from `backend/`:

```powershell
go test ./...
go vet ./...
gofmt -l .
```

A clean `gofmt -l .` run prints no files.

## Docker

From the repository root:

```powershell
docker compose up --build -d
```

The build requires Docker Desktop to reach Docker Hub. If base-image metadata cannot be resolved, check Docker Desktop proxy and DNS settings before changing project files.

## Change Boundaries

- Preserve the existing API routes and browser storage keys.
- Keep frontend behavior changes separate from visual changes.
- Run the frontend build and backend checks before submitting changes.
- Do not commit generated `frontend/dist`, dependency caches, or local `.env` files.
