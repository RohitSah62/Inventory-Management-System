import React, { useState } from 'react';
import { Lock, Boxes } from 'lucide-react';
import { api, encodeBasicAuth } from '../api/client.js';

export default function LoginPage({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = encodeBasicAuth(username.trim(), password);
      const res = await api.verifyAuth(token);
      onSuccess(token, res.user);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand" style={{ marginBottom: 20 }}>
          <div className="brand-icon">
            <Boxes size={20} />
          </div>
          <div>
            <h1 className="brand-title">Inventory FIFO Dashboard</h1>
            <p className="brand-sub">Sign in with Basic Auth credentials</p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-id">
              User ID
            </label>
            <input
              id="login-id"
              className="input"
              type="text"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 6, padding: '10px 14px' }}
            disabled={loading}
          >
            <Lock size={15} />
            {loading ? 'Signing in...' : 'Sign In to Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
