import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { DAILY_SLOTS, formatDate, nextWorkingDay, parseLocalDate } from '../utils/scheduler.js';
import { defaultPatientProfile } from '../data/constants.js';

const AppointmentScheduler = () => {
  const today = useMemo(() => nextWorkingDay(new Date()), []);
  const [patientProfile, setPatientProfile] = useLocalStorage('brightsmile-profile', defaultPatientProfile);
  const [appointmentHistory, setAppointmentHistory] = useLocalStorage('brightsmile-appointments', []);
  const [selectedDate, setSelectedDate] = useState(formatDate(today));
  const [selectedTime, setSelectedTime] = useState('');
  const [availability, setAvailability] = useState({ slots: DAILY_SLOTS.map((time) => ({ time, available: true })), appointmentCount: 0 });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/availability?date=${selectedDate}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: 'Unable to load availability.' }));
          throw new Error(error.error || 'Unable to load availability.');
        }
        return res.json();
      })
      .then((data) => {
        setAvailability(data);
        setFeedback(null);
        setSelectedTime((time) =>
          data.slots.some((slot) => slot.time === time && slot.available) ? time : '',
        );
      })
      .catch((error) => {
        setFeedback({ type: 'error', message: error.message });
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [selectedDate]);

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setPatientProfile((current) => ({ ...current, [name]: value }));
  };

  const minDate = useMemo(() => formatDate(today), [today]);
  const maxDate = useMemo(() => {
    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    return formatDate(future);
  }, [today]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selectedTime) {
      setFeedback({ type: 'error', message: 'Please choose an available time slot.' });
      return;
    }

    setSubmitting(true);
    fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...patientProfile,
        date: selectedDate,
        time: selectedTime,
        source: 'booking-widget',
      }),
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const suggestion = payload.suggestedSlot
            ? ` Suggested slot: ${payload.suggestedSlot.date} at ${payload.suggestedSlot.time}.`
            : '';
          throw new Error(`${payload.error || 'Unable to book appointment.'}${suggestion}`);
        }
        return payload;
      })
      .then((payload) => {
        setFeedback({ type: 'success', message: payload.message || 'Appointment confirmed!' });
        setAppointmentHistory((history) => [payload.appointment, ...history].slice(0, 5));
      })
      .catch((error) => {
        setFeedback({ type: 'error', message: error.message });
      })
      .finally(() => setSubmitting(false));
  };

  const handleDateChange = (event) => {
    const value = event.target.value;
    const parsed = parseLocalDate(value);
    if (!parsed || parsed.getDay() === 0) {
      setFeedback({ type: 'error', message: 'Please choose a date Monday through Saturday.' });
      return;
    }
    setSelectedDate(value);
  };

  return (
    <section id="book-online" className="scheduler">
      <div className="container">
        <div className="section-heading">
          <h2>Reserve Your Visit Online</h2>
          <p>
            Choose a date and time that works for you. We cap the schedule at six visits per day to make sure every
            patient gets unrushed attention.
          </p>
        </div>
        <div className="scheduler-card">
          <form className="scheduler-grid" onSubmit={handleSubmit}>
            <div className="grid" style={{ gap: 16 }}>
              <div className="form-control">
                <label htmlFor="name">Full Name</label>
                <input id="name" name="name" type="text" value={patientProfile.name} onChange={handleProfileChange} required />
              </div>
              <div className="form-control">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" value={patientProfile.email} onChange={handleProfileChange} required />
              </div>
              <div className="form-control">
                <label htmlFor="phone">Mobile Phone</label>
                <input id="phone" name="phone" type="tel" value={patientProfile.phone} onChange={handleProfileChange} required />
              </div>
              <div className="form-control">
                <label htmlFor="service">Service</label>
                <select id="service" name="service" value={patientProfile.service} onChange={handleProfileChange}>
                  <option>Comprehensive Exam &amp; Cleaning</option>
                  <option>Emergency Dental Visit</option>
                  <option>Invisalign® Consultation</option>
                  <option>Dental Implant Consultation</option>
                  <option>Whitening Session</option>
                </select>
              </div>
              <div className="form-control">
                <label htmlFor="notes">Notes (optional)</label>
                <textarea
                  id="notes"
                  name="notes"
                  rows="3"
                  placeholder="Share goals, concerns, or how we can make your visit more comfortable."
                  value={patientProfile.notes}
                  onChange={handleProfileChange}
                />
              </div>
            </div>
            <div className="grid" style={{ gap: 24 }}>
              <div className="form-control">
                <label htmlFor="date">Choose a Date</label>
                <input
                  id="date"
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={selectedDate}
                  onChange={handleDateChange}
                  required
                />
              </div>
              <div>
                <p style={{ fontWeight: 600 }}>Available Times</p>
                {loading ? (
                  <p>Loading availability...</p>
                ) : (
                  <div className="slot-grid">
                    {availability.slots.map((slot) => {
                      const isSelected = slot.time === selectedTime;
                      const buttonClass = [
                        'slot-button',
                        isSelected ? 'selected' : '',
                        !slot.available ? 'disabled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <button
                          type="button"
                          className={buttonClass}
                          key={slot.time}
                          disabled={!slot.available}
                          onClick={() => slot.available && setSelectedTime(slot.time)}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Booking...' : 'Confirm Appointment'}
              </button>
              {feedback && (
                <div className={`feedback ${feedback.type}`}>{feedback.message}</div>
              )}
              {appointmentHistory.length > 0 && (
                <div className="card" style={{ background: 'rgba(59,130,246,0.06)' }}>
                  <h4 style={{ marginTop: 0 }}>Recently Booked</h4>
                  <ul style={{ paddingLeft: '1.2rem', marginBottom: 0 }}>
                    {appointmentHistory.map((appointment) => (
                      <li key={`${appointment.date}-${appointment.time}`}>
                        {format(new Date(`${appointment.date}T${appointment.time}`), 'MMM d, yyyy p')} — {appointment.service}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};

export default AppointmentScheduler;
