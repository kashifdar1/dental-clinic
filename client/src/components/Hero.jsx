const Hero = () => (
  <header className="hero" id="top">
    <div className="hero-content">
      <div className="hero-text">
        <span className="badge" style={{ color: '#3b82f6', fontWeight: 700 }}>BrightSmile Dental Clinic</span>
        <h1>Experience Dentistry Designed Around Your Brightest Smile</h1>
        <p>
          Family-friendly care, advanced technology, and a concierge team who books visits around your
          schedule. From preventive care to transformative smile makeovers, everything lives here in one
          modern studio.
        </p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#book-online">Book an Appointment</a>
          <a className="btn btn-secondary" href="#services">Explore Services</a>
        </div>
      </div>
      <div className="hero-card">
        <h3 style={{ marginTop: 0 }}>New Patient Experience</h3>
        <ul style={{ paddingLeft: '1.2rem', margin: '16px 0', color: 'var(--color-muted)' }}>
          <li>Same-week openings Monday through Saturday</li>
          <li>Comfort menu with blankets, headphones &amp; aromatherapy</li>
          <li>Transparent pricing with insurance concierge support</li>
        </ul>
        <p style={{ fontWeight: 700, marginBottom: 0 }}>Call us: (555) 123-4567</p>
        <p style={{ color: 'var(--color-muted)', marginTop: 4 }}>Or chat with our team below.</p>
      </div>
    </div>
  </header>
);

export default Hero;
