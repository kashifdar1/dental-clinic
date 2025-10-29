import { doctorTeam } from '../data/services.js';

const Doctors = () => (
  <section id="doctors">
    <div className="container">
      <div className="section-heading">
        <h2>Your Smile Design Team</h2>
        <p>Meet the specialists collaborating on preventive care, orthodontics, implants, and cosmetic artistry.</p>
      </div>
      <div className="doctors-grid">
        {doctorTeam.map((doctor) => (
          <div className="card doctor-card" key={doctor.name}>
            <img src={doctor.image} alt={doctor.name} loading="lazy" />
            <h3>{doctor.name}</h3>
            <p style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{doctor.role}</p>
            <p style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}>{doctor.bio}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Doctors;
