import { usePublicTenant } from '../public/PublicTenantContext'

export function LanguagePreference() {
  const {
    languagePromptOpen,
    reopenLanguagePrompt,
    selectUiLanguage,
  } = usePublicTenant()

  return (
    <>
      {languagePromptOpen ? (
        <div className="language-prompt-backdrop" role="presentation">
          <div
            className="language-prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="language-prompt-title"
          >
            <h2 id="language-prompt-title">Choose website language</h2>
            <p className="muted">آپ ویب سائٹ کی زبان منتخب کریں</p>
            <div className="btn-row">
              <button className="btn" type="button" onClick={() => selectUiLanguage('en')}>
                English
              </button>
              <button className="btn secondary" type="button" onClick={() => selectUiLanguage('ur')}>
                اردو
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <button className="language-switch" type="button" onClick={reopenLanguagePrompt}>
        English / اردو
      </button>
    </>
  )
}
