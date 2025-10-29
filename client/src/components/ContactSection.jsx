import { useState } from 'react';

const ContactSection = () => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitting(true);
    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || 'Unable to send your message.');
        }
        return payload;
      })
      .then((payload) => {
        setStatus({ type: 'success', message: payload.message });
        setForm({ name: '', email: '', phone: '', message: '' });
      })
      .catch((error) => {
        setStatus({ type: 'error', message: error.message });
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <section id="contact">
      <div className="container">
        <div className="section-heading">
          <h2>We&apos;re Here to Help</h2>
          <p>Reach out with questions, request records, or let us know how we can support your smile goals.</p>
        </div>
        <div className="contact-grid">
          <div className="contact-card">
            <h3>Visit the Studio</h3>
            <p style={{ color: 'var(--color-muted)' }}>
              1024 Radiant Avenue, Suite 300<br />
              San Francisco, CA 94107
            </p>
            <h4>Office Hours</h4>
            <p style={{ color: 'var(--color-muted)' }}>Monday – Saturday, 11:00 AM – 7:00 PM</p>
            <h4>Call or Text</h4>
            <p style={{ color: 'var(--color-muted)' }}>(555) 123-4567</p>
            <h4>Email</h4>
            <p style={{ color: 'var(--color-muted)' }}>hello@brightsmiledental.com</p>
          </div>
          <div className="contact-card">
            <h3>Contact Us</h3>
            <form className="contact-form" onSubmit={handleSubmit}>
              <div className="form-control">
                <label htmlFor="contact-name">Name</label>
                <input id="contact-name" name="name" value={form.name} onChange={handleChange} required />
              </div>
              <div className="form-control">
                <label htmlFor="contact-email">Email</label>
                <input id="contact-email" name="email" type="email" value={form.email} onChange={handleChange} required />
              </div>
              <div className="form-control">
                <label htmlFor="contact-phone">Phone</label>
                <input id="contact-phone" name="phone" value={form.phone} onChange={handleChange} />
              </div>
              <div className="form-control">
                <label htmlFor="contact-message">How can we help?</label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows="4"
                  value={form.message}
                  onChange={handleChange}
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Sending...' : 'Send Message'}
              </button>
              {status && <div className={`feedback ${status.type}`}>{status.message}</div>}
            </form>
          </div>
          <div className="contact-map">
            <iframe
              title="BrightSmile Dental Clinic"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3153.019031726021!2d-122.40136322349333!3d37.78699611198283!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8085807bdb2b9a9f%3A0x2a4a7b2ff07d5d7!2sDental%20Clinic!5e0!3m2!1sen!2sus!4v1700000000000!5m2!1sen!2sus"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
