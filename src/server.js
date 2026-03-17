require('dotenv').config();

const app = require('./app');

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down gracefully.`);
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
