import { useMemo, useState, type ChangeEvent } from 'react'
import {
  createPractitionerCsvTemplate,
  parsePractitionerCsv,
  type PractitionerImportPreview,
} from '../domain/practitionerImport'
import { useTenant } from '../domain/TenantContext'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 500

export function PractitionerImportPanel() {
  const {
    data,
    organization,
    clinics,
    bulkImportPractitioners,
  } = useTenant()
  const [preview, setPreview] = useState<PractitionerImportPreview | null>(null)
  const [fileName, setFileName] = useState('')
  const [message, setMessage] = useState('')

  const organizationPractitioners = useMemo(
    () =>
      data.practitioners.filter(
        (practitioner) =>
          practitioner.organizationId === organization.id,
      ),
    [data.practitioners, organization.id],
  )
  const validRows = preview?.rows.filter((row) => row.input) ?? []
  const invalidRows = preview?.rows.filter((row) => !row.input) ?? []
  const canImport =
    validRows.length > 0 && (preview?.fileErrors.length ?? 0) === 0

  function downloadTemplate() {
    const csv = createPractitionerCsvTemplate(clinics)
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${organization.slug}-practitioners-template.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setMessage('')
    setPreview(null)
    if (!file) return
    setFileName(file.name)

    if (file.size > MAX_FILE_BYTES) {
      setMessage('File is too large. Maximum size is 2 MB.')
      return
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setMessage('Upload a .csv file using the downloadable template.')
      return
    }

    const nextPreview = parsePractitionerCsv(
      await file.text(),
      clinics,
      organizationPractitioners,
    )
    if (nextPreview.rows.length > MAX_ROWS) {
      setMessage(`Maximum ${MAX_ROWS} doctor rows per import.`)
      return
    }
    if (nextPreview.rows.length === 0) {
      setMessage('The CSV contains no doctor rows.')
      return
    }
    setPreview(nextPreview)
  }

  async function confirmImport() {
    if (!canImport) return
    const inputs = validRows.flatMap((row) => (row.input ? [row.input] : []))
    const result = await bulkImportPractitioners(inputs)
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setPreview(null)
    setFileName('')
    setMessage(
      `${inputs.length} doctor${inputs.length === 1 ? '' : 's'} imported. Switch clinics to review each roster.`,
    )
  }

  return (
    <section className="panel import-panel">
      <div className="page-header">
        <div>
          <h2>Bulk import doctors</h2>
          <p>
            Import up to {MAX_ROWS} doctors across clinics in{' '}
            {organization.name}. CSV is validated before anything is saved.
          </p>
        </div>
        <button className="btn secondary" type="button" onClick={downloadTemplate}>
          Download CSV template
        </button>
      </div>

      <div className="field">
        <label htmlFor="practitioner-csv">Doctor roster CSV</label>
        <input
          id="practitioner-csv"
          type="file"
          accept=".csv,text/csv"
          onChange={selectFile}
        />
      </div>
      <p className="muted import-help">
        Clinic accepts its exact name or ID. Separate multiple specialties with
        <code>|</code>, for example <code>general_medicine|dentistry</code>.
        Existing emails are rejected.
      </p>

      {message ? (
        <div className="import-message" role="status">
          {message}
        </div>
      ) : null}

      {preview ? (
        <div className="import-preview">
          <div className="import-summary" aria-live="polite">
            <strong>{fileName}</strong>
            <span className="chip">{validRows.length} valid</span>
            {invalidRows.length > 0 ? (
              <span className="chip error-chip">
                {invalidRows.length} need attention
              </span>
            ) : null}
          </div>

          {preview.fileErrors.length > 0 ? (
            <div className="import-errors" role="alert">
              {preview.fileErrors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          ) : null}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Clinic</th>
                  <th>Doctor</th>
                  <th>Specialties</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.clinicLabel || '—'}</td>
                    <td>
                      <strong>{row.fullName || '—'}</strong>
                      <div className="muted">{row.email || '—'}</div>
                    </td>
                    <td>{row.specialtyLabels.join(', ') || '—'}</td>
                    <td>
                      {row.errors.length === 0 ? (
                        <span className="chip">Ready</span>
                      ) : (
                        <ul className="row-errors">
                          {row.errors.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="btn-row">
            <button
              className="btn"
              type="button"
              disabled={!canImport}
              onClick={confirmImport}
            >
              Import {validRows.length} valid row
              {validRows.length === 1 ? '' : 's'}
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setPreview(null)
                setFileName('')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
