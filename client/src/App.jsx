import { useEffect, useMemo, useRef, useState } from 'react';

import ChatPanel from './components/ChatPanel.jsx';
import { CategoryPanel, MetricCards, SpendingPanel } from './components/Dashboard.jsx';
import ImportPanel, { MAX_FILE_BYTES } from './components/ImportPanel.jsx';
import { ErrorBanner, Footer, Sidebar, TopBar } from './components/Layout.jsx';
import TransactionsTable from './components/TransactionsTable.jsx';
import { api } from './lib/api.js';
import { CURRENCY, categoryTotals, computeMetrics, mergeTransactions, monthlySeries, sortForTable } from './lib/dashboard.js';

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [health, setHealth] = useState({ known: false, aiConfigured: false });
  const [error, setError] = useState('');
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState('');
  const [chat, setChat] = useState([]);
  const [chatSending, setChatSending] = useState(false);

  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);

  const [activeNav, setActiveNav] = useState('overview');

  const [extracting, setExtracting] = useState(false);

  // Dashboard numbers are always computed here in code — never by the LLM.
  const metrics = useMemo(() => computeMetrics(transactions), [transactions]);
  const series = useMemo(() => monthlySeries(transactions), [transactions]);
  const categories = useMemo(() => categoryTotals(transactions), [transactions]);
  const tableRows = useMemo(() => sortForTable(transactions), [transactions]);

  // The dashboard starts EMPTY. Only the AI server's health is checked on load.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .health()
      .then((data) => setHealth({ known: true, aiConfigured: Boolean(data.ai_configured) }))
      .catch(() => setHealth({ known: false, aiConfigured: false }));
  }, []);

  function clearData() {
    setTransactions([]);
    setNotes([]);
    setValidationErrors([]);
    setNotice('');
    setImportError('');
    setError('');
    setChat([]);
  }

  async function extract() {
    if (file && file.size > MAX_FILE_BYTES) {
      setImportError('Please use a file smaller than 12 MB.');
      return;
    }
    setImportError('');
    setNotice('');
    setExtracting(true);
    try {
      const result = await api.extract({ text: text.trim(), file });
      setNotes(result.notes ?? []);
      setValidationErrors(result.validation_errors ?? []);
      if (result.count === 0) {
        // Nothing valid came back: keep the current transactions.
        setImportError('No transactions could be found in that input. Check that it is a bank statement or receipt and try again.');
        return;
      }
      // Add to what is already on the dashboard (skipping exact duplicates).
      const merged = mergeTransactions(transactions, result.transactions);
      setTransactions(merged.rows);
      setNotice(
        `Added ${merged.added} transaction${merged.added === 1 ? '' : 's'}` +
          (merged.skipped ? ` (${merged.skipped} duplicate${merged.skipped === 1 ? '' : 's'} skipped)` : '') +
          '.',
      );
      setFile(null);
      setText('');
    } catch (err) {
      // 422 = not a finance document, 503 = no key, 502 = Gemini failed. Existing data stays.
      setImportError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  async function sendChat(message) {
    const history = chat.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setChat((current) => [...current, { role: 'user', content: message }]);
    setChatSending(true);
    try {
      const { reply } = await api.chat({ message, history, transactions, currency: CURRENCY });
      setChat((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (err) {
      setChat((current) => [...current, { role: 'assistant', content: err.message, error: true }]);
    } finally {
      setChatSending(false);
    }
  }

  return (
    <div className="app">
      <Sidebar transactionCount={transactions.length} active={activeNav} onNavigate={setActiveNav} />

      <main className="main">
        <TopBar
          aiConfigured={health.aiConfigured}
          healthKnown={health.known}
          onClear={clearData}
          canClear={transactions.length > 0 || chat.length > 0}
        />

        <ErrorBanner message={error} onDismiss={() => setError('')} />

        <MetricCards metrics={metrics}  />

        <div className="two-col">
          <SpendingPanel series={series} sourceLabel={transactions.length ? 'Your data' : 'No data yet'} />
          <CategoryPanel categories={categories} />
        </div>

        <ImportPanel
          text={text}
          onTextChange={setText}
          file={file}
          onFileChange={setFile}
          onExtract={extract}
          extracting={extracting}
          error={importError}
          onDismissError={() => setImportError('')}
          notice={notice}
          notes={notes}
          validationErrors={validationErrors}
        />

        <TransactionsTable rows={tableRows} />

        <ChatPanel messages={chat} onSend={sendChat} sending={chatSending} hasTransactions={transactions.length > 0} />


        <Footer />
      </main>
    </div>
  );
}
