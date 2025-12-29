import Hero from './components/Hero.jsx';
import About from './components/About.jsx';
import Services from './components/Services.jsx';
import Doctors from './components/Doctors.jsx';
import Pricing from './components/Pricing.jsx';
import Insurance from './components/Insurance.jsx';
import FAQ from './components/FAQ.jsx';
import AppointmentScheduler from './components/AppointmentScheduler.jsx';
import ContactSection from './components/ContactSection.jsx';
import Footer from './components/Footer.jsx';
import WhatsAppButton from './components/WhatsAppButton.jsx';
import ChatBot from './components/ChatBot.jsx';

const App = () => (
  <>
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
      }}
    >
      <div
        className="container"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}
      >
        <a href="#top" style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-primary)' }}>
          BrightSmile Dental
        </a>
        <div style={{ display: 'flex', gap: 24, fontWeight: 600, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <a href="#about">About</a>
          <a href="#services">Services</a>
          <a href="#doctors">Doctors</a>
          <a href="#pricing">Pricing</a>
          <a href="#insurance">Insurance</a>
          <a href="#faq">FAQ</a>
          <a href="#book-online">Book Online</a>
          <a href="#contact">Contact</a>
        </div>
      </div>
    </nav>
    <Hero />
    <About />
    <Services />
    <Doctors />
    <Pricing />
    <Insurance />
    <FAQ />
    <AppointmentScheduler />
    <ContactSection />
    <Footer />
    <WhatsAppButton />
    <ChatBot />
  </>
);

export default App;
