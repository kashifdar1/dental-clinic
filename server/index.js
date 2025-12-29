import express from 'express';
import cors from 'cors';
import { nanoid } from 'nanoid';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const OPEN_HOUR = 11;
const CLOSE_HOUR = 19;
const SLOT_DURATION_MINUTES = 30;
const MAX_APPOINTMENTS_PER_DAY = 6;
const MAX_LOOKAHEAD_DAYS = 60;
const WORKING_DAYS = new Set([1, 2, 3, 4, 5, 6]); // Monday-Saturday

const appointmentsByDate = new Map();
const contactSubmissions = [];

const buildDateKey = (date) => date.toISOString().split('T')[0];

const parseDateOnly = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const isWorkingDay = (date) => WORKING_DAYS.has(date.getDay());

const generateSlots = () => {
  const slots = [];
  const current = new Date(`1970-01-01T${String(OPEN_HOUR).padStart(2, '0')}:00:00`);
  const closing = new Date(`1970-01-01T${String(CLOSE_HOUR).padStart(2, '0')}:00:00`);

  while (current < closing) {
    slots.push(`${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`);
    current.setMinutes(current.getMinutes() + SLOT_DURATION_MINUTES);
  }

  return slots;
};

const DAILY_SLOTS = generateSlots();

const normalizeTime = (time) => {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const [hours, minutes] = time.split(':').map(Number);
  if (minutes !== 0 && minutes !== SLOT_DURATION_MINUTES) {
    return null;
  }
  if (hours < OPEN_HOUR || (hours === CLOSE_HOUR && minutes > 0) || hours > CLOSE_HOUR) {
    return null;
  }
  const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return DAILY_SLOTS.includes(formatted) ? formatted : null;
};

const getAppointmentsForDate = (dateKey) => {
  if (!appointmentsByDate.has(dateKey)) {
    appointmentsByDate.set(dateKey, []);
  }
  return appointmentsByDate.get(dateKey);
};

const isDuplicateBooking = (appointments, email, phone) =>
  appointments.some((appt) => appt.email === email || appt.phone === phone);

const buildAvailability = (dateKey) => {
  const appointments = getAppointmentsForDate(dateKey);
  const slots = DAILY_SLOTS.map((time) => ({
    time,
    available: !appointments.some((appt) => appt.time === time),
  }));
  return {
    date: dateKey,
    slots,
    appointmentCount: appointments.length,
  };
};

const findNextAvailableSlot = (startDate, email, phone) => {
  const start = new Date(startDate.getTime());
  for (let offset = 0; offset < MAX_LOOKAHEAD_DAYS; offset += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + offset);
    if (!isWorkingDay(current)) {
      continue;
    }
    const dateKey = buildDateKey(current);
    const appointments = getAppointmentsForDate(dateKey);
    if (appointments.length >= MAX_APPOINTMENTS_PER_DAY) {
      continue;
    }
    if (isDuplicateBooking(appointments, email, phone)) {
      continue;
    }
    const openSlot = DAILY_SLOTS.find(
      (slot) => !appointments.some((appt) => appt.time === slot),
    );
    if (openSlot) {
      return { date: dateKey, time: openSlot };
    }
  }
  return null;
};

app.get('/api/availability', (req, res) => {
  const { date } = req.query;
  const parsedDate = parseDateOnly(date);
  if (!parsedDate || !isWorkingDay(parsedDate)) {
    return res.status(400).json({
      error: 'Please provide a valid date between Monday and Saturday.',
    });
  }
  const availability = buildAvailability(buildDateKey(parsedDate));
  return res.json({
    ...availability,
    maxAppointments: MAX_APPOINTMENTS_PER_DAY,
  });
});

app.get('/api/appointments', (req, res) => {
  const allAppointments = [];
  appointmentsByDate.forEach((appointments, dateKey) => {
    appointments.forEach((appointment) => {
      allAppointments.push({ date: dateKey, ...appointment });
    });
  });
  res.json({ appointments: allAppointments });
});

app.post('/api/appointments', (req, res) => {
  const {
    name,
    email,
    phone,
    service,
    notes = '',
    date,
    time,
    source = 'website',
  } = req.body || {};

  if (!name || !email || !phone || !service || !date || !time) {
    return res.status(400).json({
      error: 'Missing required fields. Please provide name, email, phone, service, date, and time.',
    });
  }

  const parsedDate = parseDateOnly(date);
  if (!parsedDate || !isWorkingDay(parsedDate)) {
    return res.status(400).json({
      error: 'Appointments are available Monday through Saturday only.',
    });
  }

  const normalizedTime = normalizeTime(time);
  if (!normalizedTime) {
    return res.status(400).json({
      error: 'Please choose a valid time slot between 11:00 and 19:00 in 30-minute increments.',
    });
  }

  const dateKey = buildDateKey(parsedDate);
  const appointments = getAppointmentsForDate(dateKey);

  if (appointments.length >= MAX_APPOINTMENTS_PER_DAY) {
    const suggestion = findNextAvailableSlot(parsedDate, email, phone);
    return res.status(409).json({
      error: 'This date is fully booked. Please choose another date.',
      suggestedSlot: suggestion,
    });
  }

  if (isDuplicateBooking(appointments, email, phone)) {
    const suggestion = findNextAvailableSlot(parsedDate, email, phone);
    return res.status(409).json({
      error: 'You already have an appointment booked for this day.',
      suggestedSlot: suggestion,
    });
  }

  if (appointments.some((appt) => appt.time === normalizedTime)) {
    const suggestion = findNextAvailableSlot(parsedDate, email, phone);
    return res.status(409).json({
      error: 'This time slot is no longer available.',
      suggestedSlot: suggestion,
    });
  }

  const appointment = {
    id: nanoid(),
    name,
    email,
    phone,
    service,
    notes,
    time: normalizedTime,
    source,
    createdAt: new Date().toISOString(),
  };

  appointments.push(appointment);

  return res.status(201).json({
    message: 'Appointment booked successfully!',
    appointment: { date: dateKey, ...appointment },
  });
});

app.post('/api/contact', (req, res) => {
  const { name, email, phone, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({
      error: 'Please provide your name, email, and message so we can reach out.',
    });
  }
  const submission = {
    id: nanoid(),
    name,
    email,
    phone: phone || '',
    message,
    receivedAt: new Date().toISOString(),
  };
  contactSubmissions.push(submission);
  return res.status(201).json({ message: 'Thanks for contacting BrightSmile Dental Clinic! We will respond shortly.' });
});

app.get('/api/contact', (req, res) => {
  res.json({ submissions: contactSubmissions });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Dental Clinic API server listening on port ${PORT}`);
});
