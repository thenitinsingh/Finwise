import { useRef, useState } from 'react';

import Icon from './Icon.jsx';
import { Spinner } from './Layout.jsx';
import { fileSizeKb } from '../lib/dashboard.js';

export const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ACCEPT = 'image/*,.pdf,.csv,.txt';
const EXAMPLE_TEXT = [
  '2026-09-14 TST* SPOTIFY USA 11.99',
  '2026-09-18 UPI/FOOD DELIVERY/8231 18.75',
  '2026-09-20 POS HPCL FUEL HYD 25.00',
].join('\n');

export default function ImportPanel({
  text,
  onTextChange,
  file,
  onFileChange,
  onExtract,
  extracting,
  error,
  onDismissError,
  notice,
  notes,
  validationErrors,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const canExtract = Boolean(text.trim() || file) && !extracting;

  function pickFile(selected) {
    if (selected) onFileChange(selected);
  }

  function clearFile() {
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="card import-panel">
      <div className="section-head">
        <div>
          <h2>Bring your spending data here</h2>
        </div>
        <span className="step-tag">
          <b>01</b> Extract &amp; validate
        </span>
      </div>

      <div className="import-grid">
        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pickFile(event.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="visually-hidden"
            id="statement-file"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
          {file ? (
            <div className="file-chip">
              <span className="file-icon">
                <Icon name="file" size={20} />
              </span>
              <span className="file-meta">
                <strong title={file.name}>{file.name}</strong>
                <span>{fileSizeKb(file.size)}</span>
              </span>
              <button type="button" className="link-button" onClick={clearFile}>
                Remove
              </button>
            </div>
          ) : (
            <>
              <span className="drop-icon">
                <Icon name="upload" size={22} />
              </span>
              <p className="drop-title">Choose a receipt or statement</p>
              <p className="drop-hint">PNG, JPG, PDF, CSV or TXT · max 12 MB</p>
              <button type="button" className="button secondary small" onClick={() => inputRef.current?.click()}>
                Browse files
              </button>
            </>
          )}
        </div>

        <div className="or-divider" aria-hidden="true">
          <span>OR</span>
        </div>

        <div className="paste-box">
          <label htmlFor="raw-text" className="field-label">
            Paste raw transaction text
          </label>
          <textarea
            id="raw-text"
            rows={4}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={'2026-09-14 TST* SPOTIFY USA 11.99\n2026-09-18 UPI/FOOD DELIVERY/8231 18.75'}
            spellCheck={false}
          />
          <div className="field-foot">
            <span>Pasted text and files are used by AI agent to extract and process information and is not stored in our servers in any form.</span>
            <button type="button" className="link-button" onClick={() => onTextChange(EXAMPLE_TEXT)}>
              Use example
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="error-banner" role="alert">
          <Icon name="alert" size={20} />
          <p>{error}</p>
          <button type="button" className="error-dismiss" onClick={onDismissError} aria-label="Dismiss error">
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}

      {notice ? (
        <p className="notice-box" role="status">
          <Icon name="check" size={16} /> {notice}
        </p>
      ) : null}

      {notes.length > 0 || validationErrors.length > 0 ? (
        <div className="notes-box">
          <p className="notes-title">Extraction notes</p>
          <ul>
            {notes.map((note, index) => (
              <li key={`note-${index}`}>{note}</li>
            ))}
            {validationErrors.map((item) => (
              <li key={`row-${item.row}`}>
                Row {item.row} was rejected by schema validation and is not shown: {item.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="import-foot">
        <p className="validation-note">
          <Icon name="shield" size={16} />
          Only bank statements, receipts and transaction lists are accepted.
        </p>
        <div className="button-row">
                    <button type="button" className="button primary" onClick={onExtract} disabled={!canExtract}>
            {extracting ? <Spinner /> : <Icon name="sparkle" size={17} />}
            {extracting ? 'Extracting…' : 'Extract transactions'}
          </button>
        </div>
      </div>
    </section>
  );
}
