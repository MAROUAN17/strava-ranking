const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const dataDirectory = path.join(process.cwd(), 'data');
const databaseFilePath = path.join(dataDirectory, 'leaderboard.sqlite');
const legacyJsonFilePath = path.join(dataDirectory, 'leaderboard.json');

const ensureDataDirectory = () => {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
};

const calculateSummary = (activities) => {
  const totals = activities.reduce(
    (accumulator, activity) => {
      accumulator.activityCount += 1;
      accumulator.totalDistance += activity.distance || 0;
      accumulator.totalMovingTime += activity.moving_time || 0;
      accumulator.totalElevation += activity.total_elevation_gain || 0;
      return accumulator;
    },
    {
      activityCount: 0,
      totalDistance: 0,
      totalMovingTime: 0,
      totalElevation: 0,
    }
  );

  const totalDistanceKm = totals.totalDistance / 1000;
  const score = Math.round(
    totalDistanceKm * 12 +
      totals.activityCount * 18 +
      (totals.totalElevation / 10) +
      (totals.totalMovingTime / 3600) * 8
  );

  return {
    activityCount: totals.activityCount,
    totalDistance: totals.totalDistance,
    totalMovingTime: totals.totalMovingTime,
    totalElevation: totals.totalElevation,
    score,
  };
};

const sanitizeActivities = (activities) =>
  activities.map((activity) => ({
    id: activity.id,
    name: activity.name,
    distance: activity.distance,
    moving_time: activity.moving_time,
    elapsed_time: activity.elapsed_time,
    total_elevation_gain: activity.total_elevation_gain,
    sport_type: activity.sport_type,
    start_date: activity.start_date,
    average_speed: activity.average_speed,
  }));

const buildUserRecord = ({ athlete, activities, scope, tokens }) => {
  const recentActivities = sanitizeActivities(activities);
  const summary = calculateSummary(recentActivities);

  return {
    athleteId: athlete.id,
    firstname: athlete.firstname || '',
    lastname: athlete.lastname || '',
    city: athlete.city || '',
    country: athlete.country || '',
    sex: athlete.sex || '',
    profile: athlete.profile || athlete.profile_medium || '',
    scope: scope || null,
    tokens: tokens || null,
    summary,
    recentActivities,
    updatedAt: new Date().toISOString(),
  };
};

const parseJson = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
};

const getColumnNames = async (db, tableName) => {
  const rows = await db.all(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((row) => row.name));
};

const ensureUserTable = async (db) => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      athlete_id INTEGER PRIMARY KEY,
      firstname TEXT NOT NULL DEFAULT '',
      lastname TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      sex TEXT NOT NULL DEFAULT '',
      profile TEXT NOT NULL DEFAULT '',
      scope TEXT,
      summary_json TEXT NOT NULL,
      recent_activities_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const columns = await getColumnNames(db, 'users');
  const missingColumns = [
    ['access_token', "TEXT"],
    ['refresh_token', "TEXT"],
    ['token_expires_at', "INTEGER"],
  ].filter(([name]) => !columns.has(name));

  for (const [name, type] of missingColumns) {
    await db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
};

const databasePromise = (async () => {
  ensureDataDirectory();

  const db = await open({
    filename: databaseFilePath,
    driver: sqlite3.Database,
  });

  await ensureUserTable(db);

  const row = await db.get('SELECT COUNT(*) AS count FROM users');
  const isEmpty = !row || row.count === 0;

  if (isEmpty && fs.existsSync(legacyJsonFilePath)) {
    const legacyStore = parseJson(fs.readFileSync(legacyJsonFilePath, 'utf8'), { users: [] });

    if (Array.isArray(legacyStore.users) && legacyStore.users.length > 0) {
      await db.exec('BEGIN');

      try {
        for (const user of legacyStore.users) {
          await db.run(
            `
              INSERT OR REPLACE INTO users (
                athlete_id,
                firstname,
                lastname,
                city,
                country,
                sex,
                profile,
                scope,
                summary_json,
                recent_activities_json,
                updated_at,
                access_token,
                refresh_token,
                token_expires_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              user.athleteId,
              user.firstname || '',
              user.lastname || '',
              user.city || '',
              user.country || '',
              user.sex || '',
              user.profile || '',
              user.scope || null,
              JSON.stringify(user.summary || {}),
              JSON.stringify(user.recentActivities || []),
              user.updatedAt || new Date().toISOString(),
              null,
              null,
              null,
            ]
          );
        }

        await db.exec('COMMIT');
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    }
  }

  return db;
})();

const mapUserRow = (row) => ({
  athleteId: row.athlete_id,
  firstname: row.firstname,
  lastname: row.lastname,
  city: row.city,
  country: row.country,
  sex: row.sex,
  profile: row.profile,
  scope: row.scope,
  summary: parseJson(row.summary_json, {}),
  recentActivities: parseJson(row.recent_activities_json, []),
  updatedAt: row.updated_at,
  hasTokens: Boolean(row.refresh_token),
});

const upsertUser = async (userRecord) => {
  const db = await databasePromise;

  await db.run(
    `
      INSERT INTO users (
        athlete_id,
        firstname,
        lastname,
        city,
        country,
        sex,
        profile,
        scope,
        summary_json,
        recent_activities_json,
        updated_at,
        access_token,
        refresh_token,
        token_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(athlete_id) DO UPDATE SET
        firstname = excluded.firstname,
        lastname = excluded.lastname,
        city = excluded.city,
        country = excluded.country,
        sex = excluded.sex,
        profile = excluded.profile,
        scope = excluded.scope,
        summary_json = excluded.summary_json,
        recent_activities_json = excluded.recent_activities_json,
        updated_at = excluded.updated_at,
        access_token = COALESCE(excluded.access_token, users.access_token),
        refresh_token = COALESCE(excluded.refresh_token, users.refresh_token),
        token_expires_at = COALESCE(excluded.token_expires_at, users.token_expires_at)
    `,
    [
      userRecord.athleteId,
      userRecord.firstname,
      userRecord.lastname,
      userRecord.city,
      userRecord.country,
      userRecord.sex,
      userRecord.profile,
      userRecord.scope,
      JSON.stringify(userRecord.summary),
      JSON.stringify(userRecord.recentActivities),
      userRecord.updatedAt,
      userRecord.tokens?.accessToken || null,
      userRecord.tokens?.refreshToken || null,
      userRecord.tokens?.expiresAt || null,
    ]
  );

  return userRecord;
};

const saveAthleteTokens = async ({ athleteId, accessToken, refreshToken, expiresAt }) => {
  const db = await databasePromise;

  await db.run(
    `
      UPDATE users
      SET access_token = ?, refresh_token = ?, token_expires_at = ?
      WHERE athlete_id = ?
    `,
    [accessToken, refreshToken, expiresAt, athleteId]
  );
};

const getAthleteTokens = async (athleteId) => {
  const db = await databasePromise;
  const row = await db.get(
    `
      SELECT athlete_id, access_token, refresh_token, token_expires_at
      FROM users
      WHERE athlete_id = ?
    `,
    [athleteId]
  );

  if (!row || !row.refresh_token) {
    return null;
  }

  return {
    athleteId: row.athlete_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.token_expires_at,
  };
};

const getRankedUsers = async () => {
  const db = await databasePromise;
  const rows = await db.all('SELECT * FROM users');

  const rankedUsers = rows
    .map(mapUserRow)
    .sort((left, right) => {
      if (right.summary.score !== left.summary.score) {
        return right.summary.score - left.summary.score;
      }

      return right.summary.totalDistance - left.summary.totalDistance;
    });

  return rankedUsers.map((user, index) => ({
    rank: index + 1,
    ...user,
  }));
};

const getUserByAthleteId = async (athleteId) => {
  const users = await getRankedUsers();
  return users.find((user) => String(user.athleteId) === String(athleteId)) || null;
};

module.exports = {
  buildUserRecord,
  databaseFilePath,
  getAthleteTokens,
  getRankedUsers,
  getUserByAthleteId,
  saveAthleteTokens,
  upsertUser,
};
