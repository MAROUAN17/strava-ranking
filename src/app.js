const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');

const healthRouter = require('./routes/health.routes');
const stravaRouter = require('./routes/strava.routes');

const app = express();
const clientDistPath = path.join(process.cwd(), 'client', 'dist');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin || origin === 'null') {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
  } catch (_error) {
    return false;
  }

  return false;
};

app.use(
  cors({
    origin(origin, callback) {
      if (allowedOrigins.length === 0 || isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      console.error(`CORS origin not allowed: ${origin}`);
      return callback(null, false);
    },
  })
);
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/health', healthRouter);
app.use('/api/strava', stravaRouter);

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      name: 'ranking-strava-api',
      status: 'ok',
      message: 'Express server is running.',
    });
  });
}

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `No route found for ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);

  res.status(err.status || 500).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'Something went wrong.',
  });
});

module.exports = app;
