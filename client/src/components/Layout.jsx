import Icon from './Icon.jsx';

const NAV = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'transactions', label: 'Transactions', icon: 'list', badge: true },
  { id: 'chat', label: 'Ask Finwise', icon: 'sparkle' },
];

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Sidebar({ transactionCount, active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="activity" size={20} strokeWidth={2.4} />
        </span>
        <span className="brand-text">
          <span className="brand-name">Finwise</span>
        </span>
      </div>

      <p className="nav-label">Workspace</p>
      <nav className="nav" aria-label="Workspace">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${active === item.id ? ' is-active' : ''}`}
            aria-current={active === item.id ? 'page' : undefined}
            onClick={() => {
              onNavigate(item.id);
              scrollToSection(item.id);
            }}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
            {item.badge ? <span className="nav-badge">{transactionCount}</span> : null}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function TopBar({ aiConfigured, healthKnown, onClear, canClear }) {
  const connected = healthKnown && aiConfigured;
  return (
    <header className="topbar" id="overview">
      <div>
        <h1>Finwise - Finance Intelligence Agent</h1>
        <p className="subtitle"> Your AI guide to understanding your spending patterns and help you make smarter spending decisions.</p>
      </div>
      <div className="topbar-actions">
        <span className={`status-chip${connected ? ' is-on' : ''}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {!healthKnown ? 'Server offline' : connected ? 'AI connected' : 'AI key missing'}
        </span>
        <button type="button" className="button secondary small" onClick={onClear} disabled={!canClear} title="Remove all uploaded transactions">
          Clear data
        </button>
        <span className="avatar" aria-label="Signed-in learner">N</span>
      </div>
    </header>
  );
}

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <Icon name="alert" size={20} />
      <p>{message}</p>
      <button type="button" className="error-dismiss" onClick={onDismiss} aria-label="Dismiss error">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <span>Finwise · Your Personal Finance Intelligence Agent</span>
      <span>ALL RIGHTS RESERVED</span>
    </footer>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
