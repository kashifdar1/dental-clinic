import { pricingTiers } from '../data/services.js';

const Pricing = () => (
  <section id="pricing">
    <div className="container">
      <div className="section-heading">
        <h2>Transparent Pricing &amp; Memberships</h2>
        <p>Choose the level of support that fits your lifestyle. Our concierge team helps maximize insurance benefits.</p>
      </div>
      <div className="pricing-grid">
        {pricingTiers.map((tier) => (
          <div className="card pricing-card" key={tier.title}>
            <h3>{tier.title}</h3>
            <div className="price">{tier.price}</div>
            <p style={{ color: 'var(--color-muted)' }}>{tier.frequency}</p>
            <ul style={{ paddingLeft: '1.2rem', color: 'var(--color-muted)', lineHeight: 1.6 }}>
              {tier.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button className="btn btn-secondary" type="button" style={{ marginTop: 'auto' }}>
              Talk to Our Team
            </button>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Pricing;
