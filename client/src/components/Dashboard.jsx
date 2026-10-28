import Icon from './Icon.jsx';
import SpendingChart from './SpendingChart.jsx';
import { formatCurrency } from '../lib/dashboard.js';

const CATEGORY_COLORS = {
  Subscriptions: '#7c6cf0',
  Shopping: '#3e8ef7',
  Fuel: '#f0a43a',
  'Food delivery': '#ef6f6c',
  Dining: '#2fb67c',
  Income: '#14a3a8',
  Bills: '#9a6b4f',
  Other: '#8a90a6',
};

export const categoryColor = (category) => CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;

export function MetricCards({ metrics }) {
  const cards = [
    {
      label: 'Total transactions',
      value: metrics.count.toLocaleString('en-US'),
      sub: `${metrics.uniqueMerchants} unique merchant${metrics.uniqueMerchants === 1 ? '' : 's'}`,
      icon: 'receipt',
      tone: 'blue',
    },
    { label: 'Total outflow', value: formatCurrency(metrics.totalOutflow), sub: 'Across loaded transactions', icon: 'wallet', tone: 'violet' },
    {
      label: 'Subscription charges',
      value: formatCurrency(metrics.subscriptionTotal),
      sub: 'All visible periods combined',
      icon: 'repeat',
      tone: 'amber',
    },
    {
      label: 'Total income',
      value: formatCurrency(metrics.income),
      sub: 'Salary and deposits found',
      icon: 'trendingUp',
      tone: 'green',
    },
  ];

  return (
    <section className="metrics" aria-label="Key metrics">
      {cards.map((card) => (
        <article className="card metric" key={card.label}>
          <span className={`metric-icon tone-${card.tone}`}>
            <Icon name={card.icon} size={20} />
          </span>
          <p className="metric-label">{card.label}</p>
          <p className="metric-value">{card.value}</p>
          <p className="metric-sub">{card.sub}</p>
        </article>
      ))}
    </section>
  );
}

export function SpendingPanel({ series, sourceLabel }) {
  return (
    <section className="card panel">
      <div className="panel-head">
        <div>
          <h2>Spending activity</h2>
        </div>
        <span className="pill">{sourceLabel}</span>
      </div>
      {series.length === 0 ? (
        <p className="empty">Upload a statement or receipt to see your spending activity.</p>
      ) : (
        <SpendingChart series={series} />
      )}
    </section>
  );
}

export function CategoryPanel({ categories }) {
  return (
    <section className="card panel">
      <div className="panel-head">
        <div>
          <h2>Spending by category</h2>
        </div>
      </div>
      {categories.length === 0 ? (
        <p className="empty">Category totals appear after you upload a statement or receipt.</p>
      ) : (
        <ul className="category-list">
          {categories.map(({ category, total, width }) => {
            const color = categoryColor(category);
            return (
              <li key={category} className="category-row">
                <span className="letter-icon" style={{ color, background: `${color}1a` }}>
                  {category.charAt(0)}
                </span>
                <div className="category-body">
                  <div className="category-line">
                    <span className="category-name">{category}</span>
                    <span className="category-amount">{formatCurrency(total)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${width}%`, background: color }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
