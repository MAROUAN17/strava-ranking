const STRAVA_OAUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE_URL = 'https://www.strava.com/api/v3';
const {
  buildUserRecord,
  getAthleteTokens,
  getRankedUsers,
  getUserByAthleteId,
  saveAthleteTokens,
  upsertUser,
} = require('../services/leaderboard.store');

const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';

const getStravaConfig = () => {
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI } = process.env;

  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REDIRECT_URI) {
    const error = new Error(
      'Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REDIRECT_URI in your environment.'
    );
    error.status = 500;
    error.name = 'StravaConfigMissing';
    throw error;
  }

  return {
    clientId: STRAVA_CLIENT_ID,
    clientSecret: STRAVA_CLIENT_SECRET,
    redirectUri: STRAVA_REDIRECT_URI,
  };
};

const exchangeCodeForToken = async (code) => {
  const { clientId, clientSecret } = getStravaConfig();

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.message || 'Unable to exchange Strava authorization code.');
    error.status = response.status;
    error.name = 'StravaTokenExchangeError';
    error.details = data;
    throw error;
  }

  return data;
};

const refreshAccessToken = async (athleteId, refreshToken) => {
  const { clientId, clientSecret } = getStravaConfig();

  if (!refreshToken) {
    const error = new Error('No refresh token available. Authorize with Strava first.');
    error.status = 401;
    error.name = 'StravaRefreshTokenMissing';
    throw error;
  }

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.message || 'Unable to refresh Strava access token.');
    error.status = response.status;
    error.name = 'StravaTokenRefreshError';
    error.details = data;
    throw error;
  }

  await saveAthleteTokens({
    athleteId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  });

  return data;
};

const getAthleteIdFromRequest = (req) => {
  const athleteId = req.query.athleteId || req.params.athleteId;

  if (!athleteId) {
    const error = new Error('Provide athleteId to access hosted athlete data.');
    error.status = 400;
    error.name = 'AthleteIdRequired';
    throw error;
  }

  return athleteId;
};

const getValidAccessToken = async (athleteId) => {
  const tokens = await getAthleteTokens(athleteId);

  if (!tokens) {
    const error = new Error('No stored Strava tokens found for that athlete. Reconnect the athlete first.');
    error.status = 401;
    error.name = 'StravaAccessTokenMissing';
    throw error;
  }

  const expiresAtMs = Number(tokens.expiresAt || 0) * 1000;

  if (Date.now() >= expiresAtMs - 60 * 1000) {
    const refreshed = await refreshAccessToken(athleteId, tokens.refreshToken);
    return refreshed.access_token;
  }

  return tokens.accessToken;
};

const fetchFromStrava = async ({ athleteId, path, searchParams }) => {
  const accessToken = await getValidAccessToken(athleteId);
  const url = new URL(`${STRAVA_API_BASE_URL}${path}`);

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.message || 'Strava API request failed.');
    error.status = response.status;
    error.name = 'StravaApiError';
    error.details = data;
    throw error;
  }

  return data;
};

const getAuthUrl = (_req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: 'StravaConfigMissing',
      message: 'Set STRAVA_CLIENT_ID and STRAVA_REDIRECT_URI in your environment.',
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
  });

  return res.json({
    authUrl: `${STRAVA_OAUTH_URL}?${params.toString()}`,
  });
};

const getConnectionStatus = (_req, res) => {
  res.json({
    connected: true,
    storage: 'sqlite',
    mode: process.env.NODE_ENV || 'development',
  });
};

const handleCallback = async (req, res, next) => {
  const { code, scope, error } = req.query;

  try {
    if (error) {
      const frontendUrl = new URL(getFrontendUrl());
      frontendUrl.searchParams.set('status', 'error');
      frontendUrl.searchParams.set('message', error);

      return res.redirect(frontendUrl.toString());
    }

    if (!code) {
      return res.status(400).json({
        error: 'StravaAuthorizationCodeMissing',
        message: 'No authorization code was returned by Strava.',
      });
    }

    const tokenData = await exchangeCodeForToken(code);
    const athleteId = tokenData.athlete?.id;

    if (!athleteId) {
      const errorObject = new Error('Strava did not return an athlete id during authorization.');
      errorObject.status = 502;
      errorObject.name = 'StravaAthleteMissing';
      throw errorObject;
    }

    const athlete = tokenData.athlete;
    const activitiesResponse = await fetch(`${STRAVA_API_BASE_URL}/athlete/activities?per_page=30&page=1`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    const activitiesData = await activitiesResponse.json();

    if (!activitiesResponse.ok) {
      const errorObject = new Error(activitiesData.message || 'Unable to load athlete activities from Strava.');
      errorObject.status = activitiesResponse.status;
      errorObject.name = 'StravaActivitiesFetchError';
      errorObject.details = activitiesData;
      throw errorObject;
    }

    const userRecord = buildUserRecord({
      athlete,
      activities: Array.isArray(activitiesData) ? activitiesData : [],
      scope: scope || tokenData.scope || null,
      tokens: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
      },
    });

    await upsertUser(userRecord);

    const frontendUrl = new URL(getFrontendUrl());
    frontendUrl.searchParams.set('status', 'connected');
    frontendUrl.searchParams.set(
      'athlete',
      athlete ? `${athlete.firstname} ${athlete.lastname}` : 'Strava athlete'
    );
    frontendUrl.searchParams.set('athleteId', String(userRecord.athleteId));

    return res.redirect(frontendUrl.toString());
  } catch (err) {
    return next(err);
  }
};

const getAthlete = async (_req, res, next) => {
  try {
    const athleteId = getAthleteIdFromRequest(_req);
    const athlete = await fetchFromStrava({
      athleteId,
      path: '/athlete',
    });

    return res.json({
      connected: true,
      athlete,
    });
  } catch (err) {
    return next(err);
  }
};

const listActivities = async (req, res, next) => {
  try {
    const athleteId = getAthleteIdFromRequest(req);
    const { page = 1, per_page = 30, before, after } = req.query;
    const activities = await fetchFromStrava({
      athleteId,
      path: '/athlete/activities',
      searchParams: {
        page,
        per_page,
        before,
        after,
      },
    });

    return res.json({
      connected: true,
      count: Array.isArray(activities) ? activities.length : 0,
      activities,
    });
  } catch (err) {
    return next(err);
  }
};

const getLeaderboard = async (_req, res, next) => {
  try {
    const users = await getRankedUsers();

    return res.json({
      users,
      totalUsers: users.length,
    });
  } catch (err) {
    return next(err);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    const user = await getUserByAthleteId(req.params.athleteId);

    if (!user) {
      return res.status(404).json({
        error: 'LeaderboardUserNotFound',
        message: 'No registered athlete found for that id.',
      });
    }

    return res.json(user);
  } catch (err) {
    return next(err);
  }
};

const refreshUserProfile = async (req, res, next) => {
  try {
    const athleteId = getAthleteIdFromRequest(req);
    const athlete = await fetchFromStrava({
      athleteId,
      path: '/athlete',
    });
    const activities = await fetchFromStrava({
      athleteId,
      path: '/athlete/activities',
      searchParams: {
        per_page: 30,
        page: 1,
      },
    });
    const existingTokens = await getAthleteTokens(athleteId);

    const userRecord = buildUserRecord({
      athlete,
      activities: Array.isArray(activities) ? activities : [],
      scope: null,
      tokens: existingTokens,
    });

    await upsertUser(userRecord);
    const user = await getUserByAthleteId(athleteId);

    return res.json({
      refreshed: true,
      user,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getAuthUrl,
  getConnectionStatus,
  handleCallback,
  getAthlete,
  getLeaderboard,
  getUserProfile,
  listActivities,
  refreshUserProfile,
};
