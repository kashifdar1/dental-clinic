# BrightSmile Dental Clinic Platform

A full-stack demo for BrightSmile Dental Clinic featuring a React single-page experience and an Express API for appointment scheduling, chatbot bookings, and contact inquiries.

## Tech Stack

- **Client:** React 18 + Vite, date-fns for scheduling utilities, modern CSS styling
- **Server:** Node.js + Express with in-memory persistence and scheduling rules enforcement
- **Tooling:** LocalStorage for demo persistence, WhatsApp deep links, lightweight chatbot assistant

## Getting Started

Install dependencies for both the client and server:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

### Development

Run the API and React dev server together:

```bash
npm run dev
```

- Client: http://localhost:5173 (proxied API requests to the server)
- Server: http://localhost:5000

You can also run them independently:

```bash
npm run server   # starts Express API with nodemon
npm run client   # starts Vite dev server
```

### Production Build

Build the React app for production:

```bash
npm run build
```

Serve the API in production mode:

```bash
npm run start
```

## Features

- Comprehensive landing page covering hero, about, services, doctors, pricing, insurance, FAQ, booking, contact, and map sections
- Appointment scheduler enforcing BrightSmile rules (Mon–Sat, 11 AM–7 PM, 30-minute slots, max six visits/day, no duplicate day bookings) with localStorage history
- Express API validates and stores appointments, suggests nearest available slot when selected time is unavailable, and tracks contact submissions
- Chatbot assistant answers FAQs, guides booking requests, and places appointments when the user provides all required details
- Floating WhatsApp entry point and persistent contact form for real-world outreach

## Notes

- The API uses in-memory storage for demo purposes. Replace with a database integration before going live.
- Update the WhatsApp link and clinic contact details in the components to match your organization.
