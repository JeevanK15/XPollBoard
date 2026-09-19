# XPollBoard

**Create. Vote. Discover the Pulse.**

XPollBoard is a live polling workspace for creating questions, sharing public or private polls, collecting responses, and understanding the result as it changes. The current application combines a React/Vite frontend with a Go API, MongoDB persistence, Redis live counters, and WebSocket updates.

## Current Features

- JWT signup and login with protected owner workflows.
- Poll templates for custom, multiple-choice, yes/no, rating, and anonymous feedback questions.
- Public share links and password-protected private polls.
- Password unlock flow for private poll audiences.
- Live vote totals and WebSocket result updates.
- Voters can change their selection while a poll is active.
- Optional comments and discussion on polls.
- Owner-only insights with leaders, percentages, response totals, and close-race context.
- Dashboard with poll library, analytics, live synchronization, export, activation, editing, sharing, and deletion.
- Profile page with display-name editing, created-poll summaries, and local vote activity recovery.
- In-app success, warning, and error notifications with accessible live regions.
- Light and dark themes, responsive layouts, fixed navigation, keyboard focus states, and touch-friendly controls.

## Architecture

- **Frontend:** React, Vite, React Icons, and CSS.
- **Backend:** Go, Gin, JWT, bcrypt, and Gorilla WebSocket.
- **Database:** MongoDB stores users, polls, ownership, comments, reactions, status, and durable vote totals.
- **Live layer:** Redis provides atomic vote counters, activity data, and Pub/Sub events.
- **Realtime transport:** WebSockets push poll result changes to connected clients.
- **Deployment:** Docker Compose runs MongoDB, Redis, the API, and Nginx-served frontend images.

MongoDB is the durable source of truth. Redis accelerates live voting and event delivery. The dashboard refreshes authenticated data periodically, while poll pages receive immediate updates through WebSockets.

## Run With Docker

Requirements: Docker Desktop with access to Docker Hub.

```powershell
docker compose up --build -d
```

Open the web application at [http://localhost:5173](http://localhost:5173).

Stop the services:

```powershell
docker compose down
```

The Compose file persists MongoDB and Redis data in named volumes. Rebuild the affected service after code changes:

```powershell
docker compose up --build -d web   # frontend changes
docker compose up --build -d api   # backend changes
```

If Docker cannot resolve `registry-1.docker.io`, fix Docker Desktop DNS or proxy connectivity before changing project files.

## Local Development

Run MongoDB and Redis separately, then start the API from `backend`:

```powershell
Push-Location backend
go run ./cmd/api
Pop-Location
```

Start the frontend from `frontend`:

```powershell
Push-Location frontend
npm install
npm run dev
Pop-Location
```

The frontend reads `VITE_API_URL` when provided and otherwise uses `http://localhost:8080/api`.

## API Surface

Public routes:

- `GET /health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/polls/:shareID`
- `POST /api/polls/:shareID/votes`
- `GET /api/polls/:shareID/live` WebSocket endpoint
- `GET /api/polls/:shareID/comments`
- `POST /api/polls/:shareID/comments`
- `GET /api/polls/:shareID/reactions`
- `POST /api/polls/:shareID/reactions`
- `POST /api/polls/:shareID/access`

Authenticated owner routes:

- `POST /api/polls`
- `PUT /api/polls/:shareID`
- `GET /api/polls/mine`
- `GET /api/polls/stats`
- `GET /api/polls/:shareID/insights`
- `POST /api/polls/:shareID/close`
- `POST /api/polls/:shareID/activate`
- `DELETE /api/polls/:shareID`

## Verification

Frontend build:

```powershell
Push-Location frontend
npm.cmd run build
Pop-Location
```

Backend tests, vet, and formatting:

```powershell
Push-Location backend
go test ./...
go vet ./...
gofmt -l .
Pop-Location
```

A clean `gofmt -l .` run prints no files. See [CONTRIBUTING.md](CONTRIBUTING.md) for the project maintenance guide.

## Deployment Notes

Set production values for `MONGO_URI`, `MONGO_DATABASE`, `REDIS_ADDR`, `JWT_SECRET`, `CORS_ORIGIN`, and `VITE_API_URL`. Replace the development JWT secret before deployment. The production host must support WebSocket upgrades for poll live updates and should use managed MongoDB and Redis services.

### Render API setup

The API container does not include MongoDB or Redis. In Render, create or connect these managed services before deploying the API:

1. Create a MongoDB Atlas database and copy its connection string into `MONGO_URI` (for example, `mongodb+srv://...`). Allow the Render service's outbound access in the Atlas network settings.
2. Create a free Upstash Redis database and set `REDIS_URL` to its TLS connection URL. The API accepts `rediss://default:<password>@<host>:6379` URLs. Alternatively, set `REDIS_ADDR` to a non-TLS `host:port` supplied by another Redis provider.
3. Add these API environment variables in Render:
   - `APP_ENV=production`
   - `MONGO_URI=<MongoDB Atlas connection string>`
   - `MONGO_DATABASE=pulseboard`
   - `REDIS_URL=<Upstash Redis TLS URL>`
   - `JWT_SECRET=<long random secret>`
   - `CORS_ORIGIN=https://<your-frontend-domain>`

4. Deploy the API and copy its public URL into the frontend build variable `VITE_API_URL`, including `/api`, such as `https://<your-api-domain>/api`.
5. Configure the frontend domain and API domain to allow WebSocket upgrades. A Render API deployment with no `MONGO_URI` or `REDIS_ADDR` now stops immediately with a clear configuration error instead of attempting `localhost`.

Backend authorization enforces owner permissions, passwords are bcrypt hashed, private owner fields are excluded from public responses, and poll input is validated at the API boundary. Production deployments should additionally add rate limiting and a server-side anonymous-voter policy when stronger duplicate-vote prevention is required.
