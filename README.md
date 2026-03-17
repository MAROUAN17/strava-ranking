# ranking-strava

This project is something I built to solve a real personal problem: motivating my family members to do more sport and stay active. The idea was to make practicing sport feel more fun and engaging by creating a leaderboard and a scoring system based on Strava activities.

Technically, the app is an Express + React leaderboard and profile system powered by Strava activities.

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
ALLOWED_ORIGINS=http://localhost:5173,capacitor://localhost,http://localhost
STRAVA_CLIENT_ID=your-client-id
STRAVA_CLIENT_SECRET=your-client-secret
STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback
STRAVA_MOBILE_REDIRECT_URI=stravaranking://auth/strava/callback
STRAVA_MOBILE_BRIDGE_URL=http://localhost:3000/api/strava/mobile/callback
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
STRAVA_MOBILE_BRIDGE_URL=https://your-domain.com/api/strava/mobile/callback
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
- `GET /api/strava/mobile/auth-url`
- `GET /api/strava/mobile/callback`
- `POST /api/strava/mobile/exchange-code`
- `GET /api/strava/athlete`
- `GET /api/strava/activities`
- `POST /api/strava/leaderboard/:athleteId/refresh`

## Capacitor mobile auth

For the mobile app, Strava first redirects to your hosted backend:

```txt
https://your-domain.com/api/strava/mobile/callback
```

That backend route immediately hands off into Capacitor through:

```txt
stravaranking://auth/strava/callback
```

The app listens for that deep link, extracts the Strava `code`, and sends it to:

```txt
POST /api/strava/mobile/exchange-code
```

If you change the mobile redirect scheme, update all three places together:

- `STRAVA_MOBILE_REDIRECT_URI`
- `STRAVA_MOBILE_BRIDGE_URL`
- [`client/src/App.jsx`](/home/marouan/Desktop/ranking-strava/client/src/App.jsx)
- Android/iOS deep-link configuration

## Frontend flow

1. Open `http://localhost:5173`
2. Click `Register athlete`
3. Approve access on Strava
4. Return to the app automatically
5. See the athlete added to the leaderboard
6. Select any registered athlete to inspect their profile and recent activity snapshot
