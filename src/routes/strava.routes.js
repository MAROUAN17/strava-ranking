const express = require('express');

const {
  getAuthUrl,
  getMobileAuthUrl,
  handleMobileCallback,
  getConnectionStatus,
  handleCallback,
  getAthlete,
  getLeaderboard,
  getUserProfile,
  listActivities,
  refreshUserProfile,
  exchangeMobileCode,
} = require('../controllers/strava.controller');

const router = express.Router();

router.get('/auth-url', getAuthUrl);
router.get('/mobile/auth-url', getMobileAuthUrl);
router.get('/mobile/callback', handleMobileCallback);
router.get('/status', getConnectionStatus);
router.get('/callback', handleCallback);
router.post('/mobile/exchange-code', exchangeMobileCode);
router.get('/athlete', getAthlete);
router.get('/activities', listActivities);
router.get('/leaderboard', getLeaderboard);
router.get('/leaderboard/:athleteId', getUserProfile);
router.post('/leaderboard/:athleteId/refresh', refreshUserProfile);

module.exports = router;
