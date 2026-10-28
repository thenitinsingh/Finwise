import Icon from './Icon.jsx';
import { categoryColor } from './Dashboard.jsx';
import { formatCurrency, shortDate } from '../lib/dashboard.js';

export default function TransactionsTable({ rows }) {
  return (
    <section className="card panel" id="transactions">
      <div className="panel-head">
        <div>
          <h2>Transactions</h2>
          <p className="panel-sub">Validated, typed records feeding your dashboard</p>
        </div>
        <span className="pill">
          {rows.length} record{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No transactions yet. Upload a bank statement or receipt, or paste transaction text, to get started.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Merchant</th>
                <th scope="col">Date</th>
                <th scope="col">Category</th>
                <th scope="col">Raw source</th>
                <th scope="col" className="num">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const color = categoryColor(row.category);
                const refund = row.amount < 0;
                return (
                  <tr key={`${row.merchant}-${row.date}-${index}`}>
                    <td>
                      <span className="merchant-cell">
                        <span className="letter-icon small" style={{ color, background: `${color}1a` }}>
                          {row.merchant.charAt(0).toUpperCase()}
                        </span>
                        <strong>{row.merchant}</strong>
                      </span>
                    </td>
                    <td className={row.date ? '' : 'muted'}>{shortDate(row.date)}</td>
                    <td>
                      <span className="chip" style={{ color, background: `${color}14`, borderColor: `${color}33` }}>
                        {row.category}
                      </span>
                    </td>
                    <td className="raw">{row.raw_line ?? '—'}</td>
                    <td className={`num amount${refund ? ' is-refund' : ''}`}>
                      <Icon name={refund ? 'arrowDownLeft' : 'arrowUpRight'} size={15} />
                      {formatCurrency(Math.abs(row.amount))}
                      <span className="visually-hidden">{refund ? ' refund' : ' charge'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
