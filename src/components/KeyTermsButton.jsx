import { useEffect, useState } from 'react'
import { GLOSSARY, KEY_GLOSSARY_TERMS } from '../utils/glossary'

// Persistent floating "Key Terms" reference. Anchored bottom-right; clicking
// opens a slide-up panel with the same housing-policy glossary that the
// Missing Piece section uses inline. Esc and the backdrop close it.
export default function KeyTermsButton() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className={`key-terms-fab ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="key-terms-panel"
        aria-label={open ? 'Close key terms glossary' : 'Open key terms glossary'}
        title="Housing-policy glossary"
      >
        <span className="key-terms-fab-icon" aria-hidden="true">
          {open ? '×' : '?'}
        </span>
        <span className="key-terms-fab-label">Key Terms</span>
      </button>

      {open && (
        <div
          className="key-terms-overlay"
          role="dialog"
          aria-modal="false"
          aria-label="Housing-policy key terms"
          id="key-terms-panel"
        >
          <button
            type="button"
            className="key-terms-backdrop"
            aria-label="Close key terms"
            onClick={() => setOpen(false)}
          />
          <aside className="key-terms-panel">
            <header className="key-terms-panel-header">
              <span className="key-terms-panel-eyebrow">Glossary</span>
              <h3>Key Terms</h3>
              <p className="key-terms-panel-sub">
                Housing-policy jargon you&rsquo;ll see throughout this interface.
              </p>
              <button
                type="button"
                className="key-terms-close"
                onClick={() => setOpen(false)}
                aria-label="Close key terms"
              >
                ×
              </button>
            </header>
            <dl className="key-terms-list">
              {KEY_GLOSSARY_TERMS.map((key) => {
                const entry = GLOSSARY[key]
                if (!entry) return null
                return (
                  <div key={key} className="key-terms-item">
                    <dt>{entry.short}</dt>
                    <dd>{entry.def}</dd>
                  </div>
                )
              })}
            </dl>
          </aside>
        </div>
      )}
    </>
  )
}
