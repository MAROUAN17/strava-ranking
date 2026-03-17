import { useEffect, useMemo, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const MOBILE_REDIRECT_SCHEME =
  import.meta.env.VITE_MOBILE_REDIRECT_SCHEME || 'stravaranking://auth/strava/callback';

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  const isJson = contentType.includes('application/json');
  const data = isJson && text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.message ||
      (text ? text.slice(0, 140) : '') ||
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  if (isJson) {
    return data || {};
  }

  if (!text) {
    return {};
  }

  throw new Error('The server returned a non-JSON response. Check your API URL and deployment routing.');
};

const getJson = async (path) => {
  const response = await fetch(`${API_BASE_URL}${path}`);
  return parseResponse(response);
};

const postJson = async (path, body) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseResponse(response);
};

const formatDistance = (meters) => `${((meters || 0) / 1000).toFixed(1)} km`;
const formatElevation = (meters) => `${Math.round(meters || 0)} m`;
const formatDuration = (seconds) => {
  const totalMinutes = Math.round((seconds || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};
const formatDate = (value) => {
  if (!value) {
    return 'Unknown date';
  }

  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

function App() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [feedback, setFeedback] = useState({ tone: 'neutral', text: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);

  const selectedUser = useMemo(() => {
    if (!leaderboard.length) {
      return null;
    }

    return leaderboard.find((user) => String(user.athleteId) === String(selectedId)) || leaderboard[0];
  }, [leaderboard, selectedId]);

  const loadLeaderboard = async (preferredAthleteId) => {
    setIsLoading(true);

    try {
      const data = await getJson('/api/strava/leaderboard');
      const users = Array.isArray(data.users) ? data.users : [];

      setLeaderboard(users);

      if (preferredAthleteId) {
        setSelectedId(preferredAthleteId);
      } else if (users[0]) {
        setSelectedId(users[0].athleteId);
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return undefined;
    }

    let listenerHandle;

    const setupDeepLinkListener = async () => {
      listenerHandle = await CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
        if (!url || !url.startsWith(MOBILE_REDIRECT_SCHEME)) {
          return;
        }

        try {
          const parsedUrl = new URL(url);
          const code = parsedUrl.searchParams.get('code');
          const scope = parsedUrl.searchParams.get('scope');
          const error = parsedUrl.searchParams.get('error');

          await Browser.close();

          if (error) {
            setFeedback({
              tone: 'error',
              text: error,
            });
            return;
          }

          if (!code) {
            setFeedback({
              tone: 'error',
              text: 'No Strava authorization code was returned to the app.',
            });
            return;
          }

          setIsConnecting(true);

          const result = await postJson('/api/strava/mobile/exchange-code', {
            code,
            scope,
          });

          await loadLeaderboard(result.athleteId);
          setFeedback({
            tone: 'success',
            text: result.athlete
              ? `${result.athlete} has been added to the leaderboard.`
              : 'Athlete connected successfully.',
          });
        } catch (errorObject) {
          setFeedback({
            tone: 'error',
            text: errorObject.message,
          });
        } finally {
          setIsConnecting(false);
        }
      });
    };

    setupDeepLinkListener();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const athlete = params.get('athlete');
    const athleteId = params.get('athleteId');
    const message = params.get('message');

    if (status === 'connected') {
      setFeedback({
        tone: 'success',
        text: athlete ? `${athlete} has been added to the leaderboard.` : 'Athlete connected successfully.',
      });
    }

    if (status === 'error') {
      setFeedback({
        tone: 'error',
        text: message || 'Strava authorization failed.',
      });
    }

    loadLeaderboard(athleteId);

    if (status || athleteId || message) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);

    try {
      if (Capacitor.isNativePlatform()) {
        const data = await getJson('/api/strava/mobile/auth-url');
        await Browser.open({
          url: data.authUrl,
        });
        return;
      }

      const data = await getJson('/api/strava/auth-url');
      window.location.href = data.authUrl;
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.message,
      });
      setIsConnecting(false);
    }
  };

  const handleRefresh = async () => {
    await loadLeaderboard(selectedUser?.athleteId);
    setFeedback({
      tone: 'success',
      text: 'Leaderboard refreshed.',
    });
  };

  const handleRefreshProfile = async () => {
    if (!selectedUser) {
      return;
    }

    setIsRefreshingProfile(true);

    try {
      await postJson(`/api/strava/leaderboard/${selectedUser.athleteId}/refresh`);
      await loadLeaderboard(selectedUser.athleteId);
      setFeedback({
        tone: 'success',
        text: `${selectedUser.firstname} ${selectedUser.lastname} synced from Strava.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.message,
      });
    } finally {
      setIsRefreshingProfile(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <main className="app-frame">
        <section className="hero-card compact-hero">
          <div className="hero-copy">
            <p className="eyebrow">Leaderboard Workspace</p>
            <h1>Registered athletes, ranked and ready.</h1>
            <p className="hero-text">
              Connect each Strava athlete once to register them, then compare everyone in one leaderboard
              with a profile view built for ranking analysis.
            </p>

            <div className="hero-actions">
              <button className="primary-button" onClick={handleConnect} type="button" disabled={isConnecting}>
                {isConnecting ? 'Redirecting...' : 'Register athlete'}
              </button>
              <button className="secondary-button" onClick={handleRefresh} type="button" disabled={isLoading}>
                Refresh leaderboard
              </button>
            </div>
          </div>

          <div className="hero-panel leaderboard-stats">
            <div className="stat-chip">
              <span>Total users</span>
              <strong>{leaderboard.length}</strong>
            </div>
            <div className="stat-chip">
              <span>Top score</span>
              <strong>{leaderboard[0]?.summary?.score ?? 0}</strong>
            </div>
            <div className="stat-chip">
              <span>Selected athlete</span>
              <strong>
                {selectedUser ? `${selectedUser.firstname} ${selectedUser.lastname}` : 'None yet'}
              </strong>
            </div>
          </div>
        </section>

        {feedback.text ? <section className={`feedback-banner ${feedback.tone}`}>{feedback.text}</section> : null}

        <section className="content-grid leaderboard-layout">
          <article className="activities-card leaderboard-panel">
            <div className="section-heading">
              <div>
                <p className="section-label">Leaderboard</p>
                <h2>All registered users</h2>
              </div>
              {isLoading ? <span className="loading-chip">Loading</span> : null}
            </div>

            {leaderboard.length ? (
              <div className="leaderboard-list">
                {leaderboard.map((user) => {
                  const isSelected = selectedUser && user.athleteId === selectedUser.athleteId;

                  return (
                    <button
                      className={`leaderboard-row ${isSelected ? 'selected' : ''}`}
                      key={user.athleteId}
                      onClick={() => setSelectedId(user.athleteId)}
                      type="button"
                    >
                      <div className="leaderboard-row-main">
                        <span className="rank-badge">#{user.rank}</span>
                        <div>
                          <p>{user.firstname} {user.lastname}</p>
                          <span>
                            {user.city || 'Unknown city'}
                            {user.country ? `, ${user.country}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="leaderboard-row-metrics">
                        <strong>{user.summary.score}</strong>
                        <span>{formatDistance(user.summary.totalDistance)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-card compact">
                <h3>No registered athletes yet</h3>
                <p>Use the register button above, approve Strava access, and athletes will appear here.</p>
              </div>
            )}
          </article>

          <article className="profile-card profile-panel">
            <div className="section-heading">
              <div>
                <p className="section-label">Profile</p>
                <h2>{selectedUser ? `${selectedUser.firstname} ${selectedUser.lastname}` : 'Athlete details'}</h2>
              </div>
              <button
                className="secondary-button"
                onClick={handleRefreshProfile}
                type="button"
                disabled={!selectedUser || isRefreshingProfile}
              >
                {isRefreshingProfile ? 'Syncing...' : 'Sync athlete'}
              </button>
            </div>

            {selectedUser ? (
              <div className="profile-stack">
                <div className="profile-identity">
                  <div className="avatar-ring">
                    {selectedUser.firstname?.[0]}
                    {selectedUser.lastname?.[0]}
                  </div>

                  <div>
                    <h3>
                      Rank #{selectedUser.rank} · Score {selectedUser.summary.score}
                    </h3>
                    <p>
                      {selectedUser.city || 'Unknown city'}
                      {selectedUser.country ? `, ${selectedUser.country}` : ''}
                    </p>
                    <p>Last sync: {formatDate(selectedUser.updatedAt)}</p>
                  </div>
                </div>

                <div className="metric-grid two-columns">
                  <div className="metric-card">
                    <span>Activities scored</span>
                    <strong>{selectedUser.summary.activityCount}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Total distance</span>
                    <strong>{formatDistance(selectedUser.summary.totalDistance)}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Total moving time</span>
                    <strong>{formatDuration(selectedUser.summary.totalMovingTime)}</strong>
                  </div>
                  <div className="metric-card">
                    <span>Total elevation</span>
                    <strong>{formatElevation(selectedUser.summary.totalElevation)}</strong>
                  </div>
                </div>

                <div className="recent-block">
                  <div className="section-heading">
                    <div>
                      <p className="section-label">Recent data</p>
                      <h2>Profile activity snapshot</h2>
                    </div>
                  </div>

                  <div className="activity-list">
                    {selectedUser.recentActivities?.length ? (
                      selectedUser.recentActivities.slice(0, 8).map((activity) => (
                        <article className="activity-row" key={activity.id}>
                          <div className="activity-title">
                            <p>{activity.name}</p>
                            <span>{activity.sport_type || 'Activity'}</span>
                          </div>

                          <div className="activity-metrics">
                            <span>{formatDistance(activity.distance)}</span>
                            <span>{formatDuration(activity.moving_time)}</span>
                            <span>{formatElevation(activity.total_elevation_gain)}</span>
                            <span>{formatDate(activity.start_date)}</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="empty-card compact">
                        <h3>No recent activities</h3>
                        <p>This athlete is registered, but no recent activity snapshot is stored yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-card">
                <h3>Select an athlete</h3>
                <p>Choose a leaderboard entry to inspect that profile and see the data behind the ranking.</p>
              </div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}

export default App;
