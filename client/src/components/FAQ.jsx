import { faqs } from '../data/services.js';

const FAQ = () => (
  <section id="faq">
    <div className="container">
      <div className="section-heading">
        <h2>Frequently Asked Questions</h2>
        <p>Quick answers to help you feel confident before your first visit.</p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {faqs.map((item) => (
          <div className="faq-item" key={item.question}>
            <h4>{item.question}</h4>
            <p style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}>{item.answer}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default FAQ;
