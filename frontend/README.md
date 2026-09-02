# Frontend — Automatic Block Planning (TrackSquads)

## Setup
```
npm install
npm run dev
```
Runs on http://localhost:5173. API calls to `/api/*` are proxied to the FastAPI backend on `http://localhost:8000` (see `vite.config.js`).

## Structure
See `src/screens/` for the 6-step flow. Shared state across steps lives in `src/hooks/usePlanningFlow.js`. All backend calls go through `src/lib/api.js`.
