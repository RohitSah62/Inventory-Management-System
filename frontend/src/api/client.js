const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function encodeBasicAuth(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function request(path, token, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Basic ${token}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || `Request failed with status ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

export const api = {
  verifyAuth: (token) => request('/api/auth/verify', token),
  getHealth: () => request('/health', null),
  getOverview: (token) => request('/api/inventory/overview', token),
  getLedger: (token, { productId = '', eventType = '', limit = 100 } = {}) => {
    const params = new URLSearchParams();
    if (productId) params.set('product_id', productId);
    if (eventType) params.set('event_type', eventType);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return request(`/api/inventory/ledger${qs ? `?${qs}` : ''}`, token);
  },
  getProductBatches: (token, productId, includeExhausted = false) =>
    request(
      `/api/inventory/batches/${encodeURIComponent(productId)}?include_exhausted=${includeExhausted}`,
      token
    ),
  getRejectedEvents: (token, limit = 10) =>
    request(`/api/inventory/rejected?limit=${limit}`, token),
  simulateEvents: (token, payload) =>
    request('/api/events/simulate', token, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getStreamUrl: (token) => `${API_BASE}/api/events/stream?auth=${encodeURIComponent(token)}`,
};
