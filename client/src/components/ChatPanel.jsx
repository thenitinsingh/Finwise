import { useEffect, useRef, useState } from 'react';

import Icon from './Icon.jsx';
import { Spinner } from './Layout.jsx';

const SUGGESTIONS = [
  'How can I control my spending on petrol?',
  'Where is most of my money going?',
  'Which subscriptions should I review?',
  'How much should I be saving each month?',
];

const WELCOME =
  'Hi! I\'m Finwise. Upload a statement or receipt above, then ask me questions about your spending, budget, or savings. I\'ll do my best to help you understand your finances and make better decisions.';
export default function ChatPanel({ messages, onSend, sending, hasTransactions }) {
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, sending]);

  function submit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    onSend(text);
  }

  return (
    <section className="card panel chat-panel" id="chat">
      <div className="panel-head">
        <div>
          <h2>Ask Finwise</h2>
          <p className="panel-sub">
            {hasTransactions
              ? 'Answers use the transactions loaded above.'
              : 'No transactions loaded yet. Upload a statement for personalised advice.'}
          </p>
        </div>
      </div>

      <div className="chat-log" aria-live="polite">
        <div className="chat-bubble assistant">{WELCOME}</div>
        {messages.map((message, index) => (
          <div key={index} className={`chat-bubble ${message.role}${message.error ? ' is-error' : ''}`}>
            {message.error ? <Icon name="alert" size={16} /> : null}
            <span className="chat-text">{message.content}</span>
          </div>
        ))}
        {sending ? (
          <div className="chat-bubble assistant">
            <Spinner /> Thinking…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {messages.length === 0 ? (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" className="chip-button" onClick={() => onSend(suggestion)} disabled={sending}>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <form className="chat-form" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          maxLength={1000}
          placeholder="Ask about your spending, budget or savings…"
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Your question"
        />
        <button type="submit" className="button primary" disabled={!draft.trim() || sending}>
          {sending ? <Spinner /> : <Icon name="sparkle" size={17} />}
          Ask
        </button>
      </form>
    </section>
  );
}
