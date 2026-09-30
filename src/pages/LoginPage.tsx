import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTenant } from '../domain/TenantContext'

export function LoginPage() {
  const navigate = useNavigate()
  const { data, membership, switchMembership } = useTenant()
  const [selectedMembershipId, setSelectedMembershipId] = useState(membership.id)

  function submit(event: FormEvent) {
    event.preventDefault()
    switchMembership(selectedMembershipId)
    navigate('/admin')
  }

  return (
    <main className="not-found">
      <form className="panel form-grid login-panel" onSubmit={submit}>
        <div className="full">
          <h1>Clinic Hub access</h1>
          <p className="muted stack-tight">
            Demo membership picker. Production authentication is still required.
          </p>
        </div>
        <div className="field full">
          <label htmlFor="membership">Choose membership</label>
          <select
            id="membership"
            value={selectedMembershipId}
            onChange={(event) => setSelectedMembershipId(event.target.value)}
          >
            {data.memberships.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName} · {item.role} · {item.email}
              </option>
            ))}
          </select>
        </div>
        <button className="btn full" type="submit">
          Continue to admin
        </button>
      </form>
    </main>
  )
}