// In-memory audit session store. PRIVACY: nothing is persisted — every
// session disappears when the server restarts. There is no database.

const MAX_SESSIONS = 500; // keep memory bounded during a long workshop

export class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  save(session) {
    this.sessions.delete(session.session_id); // re-insert so the newest is last
    this.sessions.set(session.session_id, session);
    while (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      this.sessions.delete(oldest);
    }
    return session;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }
}
