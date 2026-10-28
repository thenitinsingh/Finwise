// One consistent set of simple outline icons (24×24, 1.8px stroke).

const PATHS = {
  activity: <polyline points="3 12 7 12 10 5 14 19 17 12 21 12" />,
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  list: (
    <>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <line x1="12" y1="8" x2="12" y2="4" />
      <circle cx="12" cy="3.5" r="1" />
      <line x1="9" y1="13" x2="9" y2="14.5" />
      <line x1="15" y1="13" x2="15" y2="14.5" />
      <line x1="2" y1="13" x2="4" y2="13" />
      <line x1="20" y1="13" x2="22" y2="13" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V6z" />
      <polyline points="9 12 11 14 15 10" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <polyline points="20 4 20 9 15 9" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7.5" x2="12" y2="13" />
      <line x1="12" y1="16.5" x2="12" y2="16.6" />
    </>
  ),
  close: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  upload: (
    <>
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <polyline points="7.5 8.5 12 4 16.5 8.5" />
      <line x1="12" y1="4" x2="12" y2="15" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" />
    </>
  ),
  arrowUpRight: (
    <>
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="8 7 17 7 17 16" />
    </>
  ),
  arrowDownLeft: (
    <>
      <line x1="17" y1="7" x2="7" y2="17" />
      <polyline points="16 17 7 17 7 8" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7a2 2 0 0 1 2-2h12v4" />
      <rect x="4" y="7" width="16" height="12" rx="2.5" />
      <circle cx="16" cy="13" r="1.2" />
    </>
  ),
  repeat: (
    <>
      <polyline points="17 2.5 20.5 6 17 9.5" />
      <path d="M3.5 11.5V10a4 4 0 0 1 4-4h13" />
      <polyline points="7 21.5 3.5 18 7 14.5" />
      <path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13" />
    </>
  ),
  trendingUp: (
    <>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <polyline points="14 3 14 8 19 8" />
    </>
  ),
  check: <polyline points="5 12.5 10 17 19 7.5" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="9" y1="3" x2="9" y2="7" />
      <line x1="15" y1="3" x2="15" y2="7" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <polyline points="3.5 7 12 13 20.5 7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="16" y1="16" x2="20.5" y2="20.5" />
    </>
  ),
  calculator: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <rect x="8" y="6" width="8" height="3.5" rx="1" />
      <line x1="8.5" y1="13" x2="8.6" y2="13" />
      <line x1="12" y1="13" x2="12.1" y2="13" />
      <line x1="15.5" y1="13" x2="15.6" y2="13" />
      <line x1="8.5" y1="17" x2="8.6" y2="17" />
      <line x1="12" y1="17" x2="12.1" y2="17" />
      <line x1="15.5" y1="17" x2="15.6" y2="17" />
    </>
  ),
  hand: (
    <>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6.5 7-2.6 0-4-1.2-5.3-3.2L3.6 14.5a1.6 1.6 0 0 1 2.6-1.8L8 15" />
    </>
  ),
};

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.8, title }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name] ?? null}
    </svg>
  );
}
