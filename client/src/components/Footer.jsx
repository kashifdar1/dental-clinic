const Footer = () => (
  <footer className="footer">
    <div className="container">
      <p>&copy; {new Date().getFullYear()} BrightSmile Dental Clinic. All rights reserved.</p>
      <p style={{ color: 'rgba(255,255,255,0.72)' }}>
        1024 Radiant Avenue, Suite 300 · San Francisco, CA · (555) 123-4567
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
        <a href="#top">Back to top</a>
        <a href="mailto:hello@brightsmiledental.com">Email</a>
        <a href="tel:15551234567">Call</a>
      </div>
    </div>
  </footer>
);

export default Footer;
