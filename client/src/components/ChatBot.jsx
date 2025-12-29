import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { defaultPatientProfile } from '../data/constants.js';
import { formatDate, nextWorkingDay } from '../utils/scheduler.js';

const FAQ_RESPONSES = [
  {
    triggers: ['hour', 'open', 'time'],
    response: 'We are open Monday through Saturday from 11:00 AM to 7:00 PM. Sundays are reserved for rest and maintenance.',
  },
  {
    triggers: ['insurance', 'coverage'],
    response:
      'We accept most major PPO plans and will file claims for you. No insurance? Ask about our Smile Wellness membership or CareCredit financing.',
  },
  {
    triggers: ['payment', 'financ'],
    response: 'We accept all major credit cards, HSA/FSA cards, and offer 0% financing through CareCredit® and Sunbit.',
  },
];

const INTRO_MESSAGE =
  'Hi! I’m Bree, your BrightSmile assistant. Ask about services, insurance, or send “Book: name: Jane Doe, email: jane@example.com, phone: 555-111-2222, service: Invisalign consultation, date: 2024-06-15, time: 14:30” to reserve a visit.';

const parseBookingRequest = (text) => {
  if (!text.toLowerCase().startsWith('book')) return null;
  const content = text.slice(text.indexOf(':') + 1);
  const parts = content.split(',');
  const payload = {};
  parts.forEach((part) => {
    const [rawKey, ...rawValue] = part.split(':');
    if (!rawKey || rawValue.length === 0) return;
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.join(':').trim();
    payload[key] = value;
  });
  const required = ['name', 'phone', 'service', 'date', 'time'];
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) {
    return { error: `I still need ${missing.join(', ')} to place your booking.` };
  }
  return payload;
};

const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useLocalStorage('brightsmile-chat', [
    { id: 'intro', from: 'bot', text: INTRO_MESSAGE, timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [profile, setProfile] = useLocalStorage('brightsmile-profile', defaultPatientProfile);
  const [isProcessing, setIsProcessing] = useState(false);
  const today = useMemo(() => formatDate(nextWorkingDay(new Date())), []);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const addMessage = (from, text) => {
    setMessages((prev) => [
      ...prev,
      { id: `${from}-${Date.now()}`, from, text, timestamp: new Date().toISOString() },
    ]);
  };

  const handleFaqResponse = (text) => {
    const intent = FAQ_RESPONSES.find((faq) =>
      faq.triggers.some((trigger) => text.toLowerCase().includes(trigger)),
    );
    if (intent) {
      addMessage('bot', intent.response);
      return true;
    }
    return false;
  };

  const handleBooking = async (payload) => {
    if (payload.error) {
      addMessage('bot', payload.error);
      return;
    }

    const date = payload.date || today;
    const requestBody = {
      name: payload.name,
      email: payload.email || profile.email,
      phone: payload.phone,
      service: payload.service,
      notes: payload.notes || '',
      date,
      time: payload.time,
      source: 'chatbot',
    };

    if (!requestBody.email) {
      addMessage('bot', 'Could you include an email address as well? I need it to finalize your visit.');
      return;
    }

    setProfile((current) => ({
      ...current,
      name: requestBody.name,
      email: requestBody.email,
      phone: requestBody.phone,
      service: requestBody.service,
    }));

    setIsProcessing(true);
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.suggestedSlot) {
          addMessage(
            'bot',
            `${data.error} The nearest available time is ${data.suggestedSlot.date} at ${data.suggestedSlot.time}.`
          );
        } else {
          addMessage('bot', data.error || 'Something went wrong while booking.');
        }
        return;
      }
      addMessage(
        'bot',
        `All set! I reserved ${format(new Date(`${data.appointment.date}T${data.appointment.time}`), 'MMM d, yyyy p')} for ${data.appointment.service}. You will receive a confirmation email shortly.`,
      );
    } catch (error) {
      addMessage('bot', 'I could not reach our scheduling system. Please try again in a moment.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    addMessage('user', userMessage);
    setInput('');

    if (handleFaqResponse(userMessage)) {
      return;
    }

    const bookingPayload = parseBookingRequest(userMessage);
    if (bookingPayload) {
      handleBooking(bookingPayload);
      return;
    }

    addMessage(
      'bot',
      "I can help with hours, insurance questions, or bookings. To reserve a visit, try: 'Book: name: John Doe, email: john@example.com, phone: 555-555-5555, service: Whitening Session, date: 2024-06-01, time: 13:00'.",
    );
  };

  return (
    <>
      <button type="button" className="chatbot-toggle" onClick={() => setIsOpen((open) => !open)}>
        <span role="img" aria-hidden="true">
          🤖
        </span>
        {isOpen ? 'Close chat' : 'Chat with Bree'}
      </button>
      {isOpen && (
        <div className="chatbot-panel">
          <div className="chatbot-header">
            <div>
              <strong>Bree • BrightSmile Assistant</strong>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Ask questions or book instantly.</div>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 20 }}>
              ×
            </button>
          </div>
          <div className="chatbot-messages">
            {messages.map((message) => (
              <div key={message.id} className={`chatbot-message ${message.from}`}>
                {message.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form className="chatbot-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder={isProcessing ? 'Booking your visit…' : 'Type a message'}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isProcessing}
            />
            <button type="submit" disabled={isProcessing}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default ChatBot;
