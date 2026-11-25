import React, { useEffect, useState } from 'react';
import { api } from './api/client.js';
import LoginPage from './components/LoginPage.jsx';
import Dashboard from './components/Dashboard.jsx';

const STORAGE_KEY = 'inventory_fifo_basic_token';

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(STORAGE_KEY) || '');
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(token));

  useEffect(() => {
    let active = true;
    if (!token) {
      setChecking(false);
      return;
    }

    api
      .verifyAuth(token)
      .then((res) => {
        if (active) {
          setUser(res.user);
        }
      })
      .catch(() => {
        if (active) {
          sessionStorage.removeItem(STORAGE_KEY);
          setToken('');
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleLoginSuccess = (newToken, authenticatedUser) => {
    sessionStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken('');
    setUser(null);
  };

  if (checking) {
    return (
      <div className="login-shell">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  return <Dashboard token={token} user={user} onLogout={handleLogout} />;
}
