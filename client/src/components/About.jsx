const About = () => (
  <section id="about">
    <div className="container">
      <div className="section-heading">
        <h2>Care Built on Trust, Technology, and Comfort</h2>
        <p>
          BrightSmile Dental Clinic blends spa-level amenities with evidence-based dentistry. Our
          multi-specialty team partners with you to create a tailored roadmap for lasting oral health.
        </p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div className="card">
          <h3>Modern Technology</h3>
          <p>
            3D imaging, digital impressions, and AI-powered diagnostic tools help us spot issues early
            and keep every visit efficient.
          </p>
        </div>
        <div className="card">
          <h3>Comfort-First Experience</h3>
          <p>
            Netflix-equipped suites, Tempur-Pedic chairs, and aromatherapy calm even the most
            appointment-shy patients.
          </p>
        </div>
        <div className="card">
          <h3>Whole-Family Focus</h3>
          <p>
            From toddlers to grandparents, we tailor each visit with age-appropriate education and
            prevention plans.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default About;
