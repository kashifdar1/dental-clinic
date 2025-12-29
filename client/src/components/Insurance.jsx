import { insuranceFaq } from '../data/services.js';

const Insurance = () => (
  <section id="insurance" className="scheduler">
    <div className="container">
      <div className="section-heading">
        <h2>Insurance &amp; Payment Support</h2>
        <p>We simplify insurance so you can focus on your smile. Dedicated coordinators handle paperwork and approvals.</p>
      </div>
      <div className="insurance-grid">
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.14), rgba(14,165,233,0.16))' }}>
          <h3>We&apos;ve Got You Covered</h3>
          <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
            <li>In-network with Delta Dental, MetLife, Aetna, and more</li>
            <li>Complimentary benefits checks before every visit</li>
            <li>Flexible payment plans with 0% financing options</li>
            <li>Membership plan for patients without insurance</li>
          </ul>
        </div>
        {insuranceFaq.map((item) => (
          <div className="card" key={item.question}>
            <h4>{item.question}</h4>
            <p style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}>{item.answer}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Insurance;
