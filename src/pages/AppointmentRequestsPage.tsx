import { WEEK_DAYS } from '../domain/availability'
import { useState } from 'react'
import { useTenant, type MutationResult } from '../domain/TenantContext'
import type { AppointmentRequestStatus } from '../domain/types'
import { SaveStatus } from '../components/SaveStatus'

const STATUSES: AppointmentRequestStatus[] = [
  'new',
  'contacted',
  'booked',
  'declined',
]

export function AppointmentRequestsPage() {
  const {
    appointmentRequests,
    practitioners,
    updateAppointmentRequestStatus,
    status,
  } = useTenant()
  const [result, setResult] = useState<MutationResult | null>(null)

  async function updateStatus(requestId: string, nextStatus: AppointmentRequestStatus) {
    setResult(null)
    const nextResult = await updateAppointmentRequestStatus(requestId, nextStatus)
    setResult(nextResult)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Appointment requests</h1>
          <p>Review and update appointment requests for the selected clinic.</p>
        </div>
      </div>

      <div className="panel table-wrap">
        {appointmentRequests.length === 0 ? (
          <div className="empty">No appointment requests yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Preferred day</th>
                <th>Contact</th>
                <th>Message</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointmentRequests.map((request) => {
                const practitioner = practitioners.find(
                  (item) => item.id === request.practitionerId,
                )
                const preferredDay = WEEK_DAYS.find(
                  (day) => day.value === request.preferredDay,
                )
                return (
                  <tr key={request.id}>
                    <td data-label="Patient">
                      <strong>{request.patientName}</strong>
                      <div className="muted">
                        {new Date(request.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td data-label="Doctor">{practitioner?.fullName ?? '—'}</td>
                    <td data-label="Preferred day">{preferredDay?.label ?? 'Any available day'}</td>
                    <td data-label="Contact">
                      <div>{request.phone}</div>
                      {request.email ? <div className="muted">{request.email}</div> : null}
                    </td>
                    <td data-label="Message" className="muted">{request.message ?? '—'}</td>
                    <td data-label="Status">
                      <select
                        aria-label={`Status for ${request.patientName}`}
                        value={request.status}
                        onChange={(event) =>
                          void updateStatus(
                            request.id,
                            event.target.value as AppointmentRequestStatus,
                          )
                        }
                      >
                        {STATUSES.map((statusOption) => (
                          <option key={statusOption} value={statusOption}>
                            {statusOption}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <SaveStatus status={status} result={result} />
    </div>
  )
}
