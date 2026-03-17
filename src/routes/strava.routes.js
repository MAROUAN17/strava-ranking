const express = require('express');

const {
  getAuthUrl,
  getConnectionStatus,
  handleCallback,
  getAthlete,
  getLeaderboard,
  getUserProfile,
  listActivities,
  refreshUserProfile,
} = require('../controllers/strava.controller');

const router = express.Router();

router.get('/auth-url', getAuthUrl);
router.get('/status', getConnectionStatus);
router.get('/callback', handleCallback);
router.get('/athlete', getAthlete);
router.get('/activities', listActivities);
router.get('/leaderboard', getLeaderboard);
router.get('/leaderboard/:athleteId', getUserProfile);
router.post('/leaderboard/:athleteId/refresh', refreshUserProfile);

module.exports = router;
