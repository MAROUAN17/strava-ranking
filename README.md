# ranking-strava

Express + React starter for building a leaderboard and profile system powered by Strava activities.

## Stack

- Express API on `http://localhost:3000`
- React frontend with Vite on `http://localhost:5173`
- Strava OAuth for connecting and fetching athlete activity data
- SQLite for local persistent storage

## Quick start

1. Install backend dependencies:

```bash
npm install
```

2. Install frontend dependencies:

```bash
npm --prefix client install
```

3. Create your environment file:

```bash
cp .env.example .env
```

4. Start the API:

```bash
npm run dev:server
```

5. Start the frontend in a second terminal:

```bash
npm run dev:client
```

## Environment

```env
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173
STRAVA_CLIENT_ID=your-client-id
STRAVA_CLIENT_SECRET=your-client-secret
STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback
FRONTEND_URL=http://localhost:5173
```

## Hosting

1. Set production environment values:

```env
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://your-domain.com
FRONTEND_URL=https://your-domain.com
STRAVA_REDIRECT_URI=https://your-domain.com/api/strava/callback
```

2. Build the frontend:

```bash
npm run build
```

3. Start the app:

```bash
npm start
```

In production, Express serves the built frontend from `client/dist`, so you can host this as a single app.

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

The app will be available on `http://localhost:3000`.

Notes:

- The SQLite database is persisted through the mounted [`data`](/home/marouan/Desktop/ranking-strava/data) folder.
- Make sure [`.env`](/home/marouan/Desktop/ranking-strava/.env) contains your production-ready Strava values before starting.
- Rotate your Strava client secret if it was exposed previously.

## Main routes

- `GET /api/health`
- `GET /api/strava/auth-url`
- `GET /api/strava/status`
- `GET /api/strava/callback`
- `GET /api/strava/athlete`
- `GET /api/strava/activities`
- `POST /api/strava/leaderboard/:athleteId/refresh`

## Frontend flow

1. Open `http://localhost:5173`
2. Click `Register athlete`
3. Approve access on Strava
4. Return to the app automatically
5. See the athlete added to the leaderboard
6. Select any registered athlete to inspect their profile and recent activity snapshot
