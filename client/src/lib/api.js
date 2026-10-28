// Thin client for the server's JSON API. The client never talks to an LLM —
// only to the server, whose base URL comes from SERVER_URL.

export const SERVER_URL = (import.meta.env.SERVER_URL || 'http://localhost:8000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${SERVER_URL}/api${path}`, options);
  } catch {
    throw new ApiError(`Could not reach the server at ${SERVER_URL}. Is it running?`, 0);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response; handled below.
  }

  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (HTTP ${response.status}).`;
    throw new ApiError(detail, response.status);
  }
  if (body === null) throw new ApiError('The server returned an unexpected response.', response.status);
  return body;
}

const jsonPost = (path, payload) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const api = {
  health: () => request('/health'),
  sample: () => request('/sample'),
  extract: ({ text, file }) => {
    const form = new FormData();
    if (text) form.append('text', text);
    if (file) form.append('file', file);
    return request('/extract', { method: 'POST', body: form });
  },
  chat: ({ message, history, transactions, currency }) => jsonPost('/chat', { message, history, transactions, currency }),
  startAudit: (transactions, goal) => jsonPost('/audits', { transactions, goal }),
  getAudit: (sessionId) => request(`/audits/${encodeURIComponent(sessionId)}`),
  decide: (sessionId, decision, reason) =>
    jsonPost(`/audits/${encodeURIComponent(sessionId)}/approval`, { decision, reason: reason || null }),
};
