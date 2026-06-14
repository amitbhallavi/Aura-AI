# AURA — AI Assistant Platform

> Full-stack AI assistant platform with chat, voice calls, SMS/WhatsApp automation, and task scheduling. Built for Indian users with Hinglish support.

---

## 📁 Project Structure

```
aura-platform/
├── frontend/          React + Vite + Tailwind + Redux Toolkit
└── backend/           Node.js + Express + PostgreSQL + MongoDB
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL (local or cloud)
- MongoDB (local or MongoDB Atlas)
- Twilio account
- OpenAI API key

---

### 1. Clone & Setup

```bash
git clone https://github.com/yourname/aura-platform.git
cd aura-platform
```

---

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy env file and fill in your keys
cp .env.example .env
# Edit .env with your API keys

# Create PostgreSQL database
createdb aura_db

# Run schema (creates all tables)
psql -U postgres -d aura_db -f schema.sql

# Start development server
npm run dev
# Backend runs at http://localhost:5000
```

---

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy env file (default works for local dev)
cp .env.example .env

# Start development server
npm run dev
# Frontend runs at http://localhost:5173
```

---

### 4. Open App

Visit **http://localhost:5173** → Register → Start using AURA!

---

## 🔑 API Keys You Need

| Service    | Where to get                     | Used for                      |
|------------|----------------------------------|-------------------------------|
| OpenAI     | platform.openai.com              | AI chat, voice (Whisper + TTS)|
| Twilio     | twilio.com                       | Calls, SMS, WhatsApp          |
| PostgreSQL | Local or render.com/supabase.com | Structured data               |
| MongoDB    | mongodb.com/atlas (free tier)    | Chat logs, AI memory          |

---

## 🌐 API Endpoints

| Method | Endpoint                  | Auth | Description                 |
|--------|---------------------------|------|-----------------------------|
| POST   | /api/auth/register        | ✅   | Register new user           |
| POST   | /api/auth/login           | ✅   | Login, get JWT token        |
| GET    | /api/auth/profile         | ✅   | Get logged-in user          |
| POST   | /api/chat/message         | ✅   | Send message to AI          |
| GET    | /api/chat/history         | ✅   | Get chat history            |
| POST   | /api/chat/voice           | ✅   | Voice → AI response → Voice |
| DELETE | /api/chat/memory          | ✅   | Clear AI memory             |
| POST   | /api/calls/schedule       | ✅   | Schedule auto-call          |
| GET    | /api/calls                | ✅   | Get all calls               |
| PATCH  | /api/calls/:id/cancel     | ✅   | Cancel a call               |
| POST   | /api/messages/sms         | ✅   | Send SMS                    |
| POST   | /api/messages/whatsapp    | ✅   | Send WhatsApp               |
| GET    | /api/messages             | ✅   | Message history             |
| GET    | /api/tasks                | ✅   | Get all tasks               |
| POST   | /api/tasks                | ✅   | Create task                 |
| PATCH  | /api/tasks/:id/toggle     | ✅   | Toggle task done/undone     |
| DELETE | /api/tasks/:id            | ✅   | Delete task                 |

---

## ☁️ Deployment

### Backend → Render.com
1. Push code to GitHub
2. Create new Web Service on Render
3. Build Command: `npm install`
4. Start Command: `node src/app.js`
5. Add all `.env` variables in Render dashboard
6. Add Render PostgreSQL + connect MongoDB Atlas

### Frontend → Vercel
1. Push code to GitHub
2. Import project on Vercel
3. Set `VITE_API_URL` = your Render backend URL + `/api`
4. Deploy

---

## 🏗️ Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | React 18, Vite, Tailwind CSS, Redux Toolkit |
| Backend     | Node.js, Express.js                 |
| Database    | PostgreSQL (users/calls/tasks), MongoDB (AI memory/logs) |
| Cache       | Redis                               |
| AI          | OpenAI GPT-4o, Whisper STT, TTS-1   |
| Calls/SMS   | Twilio Voice + Messaging API        |
| Auth        | JWT (jsonwebtoken + bcryptjs)       |
| Scheduling  | node-cron                           |
| Deployment  | Vercel (frontend) + Render (backend)|

---

## 🇮🇳 India-First Features

- **Hinglish mode** — AI responds in natural Hindi + English mix
- **Hindi TTS** — Calls use Amazon Polly Aditi voice (hi-IN)
- **Whisper STT** — Handles Hindi and Hinglish speech input
- **Multi-language** — Support for Hindi, Marathi, Tamil, Telugu, Gujarati, Bengali
- **WhatsApp** — Primary messaging channel for Indian users

---

## 📞 How Auto-Calling Works

1. User schedules a call via Dashboard or Chat
2. Call is saved in PostgreSQL with `status = 'scheduled'`
3. `scheduler.service.js` runs every minute via `node-cron`
4. When `scheduled_at <= now`, Twilio dials the number
5. AI reads the message using Hindi TTS (Polly.Aditi)
6. User presses 1 to confirm, 2 to reschedule
7. Call status updates to `completed` or `failed`
