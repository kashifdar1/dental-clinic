import { advancedServices, basicServices } from '../data/services.js';

const ServiceColumn = ({ title, services }) => (
  <div>
    <h3 style={{ marginBottom: 16 }}>{title}</h3>
    <div className="services-grid">
      {services.map((service) => (
        <div className="card" key={service.title}>
          <div style={{ fontSize: 32 }}>{service.icon}</div>
          <h4>{service.title}</h4>
          <p style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}>{service.description}</p>
        </div>
      ))}
    </div>
  </div>
);

const Services = () => (
  <section id="services">
    <div className="container">
      <div className="section-heading">
        <h2>Complete Dental Care, From Routine to Remarkable</h2>
        <p>Discover the foundational services every smile needs and the advanced treatments that elevate confidence.</p>
      </div>
      <div className="grid" style={{ gap: 48 }}>
        <ServiceColumn title="Core &amp; Preventive" services={basicServices} />
        <ServiceColumn title="Advanced &amp; Cosmetic" services={advancedServices} />
      </div>
    </div>
  </section>
);

export default Services;
