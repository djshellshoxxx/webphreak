require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const carriers = JSON.parse(fs.readFileSync(path.join(__dirname, 'carriers.json'), 'utf8'));

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/send', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
}));

const lastSent = new Map();
const COOLDOWN_MS = 60 * 1000;

function cleanNumber(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

app.get('/api/carriers', (req, res) => {
  const list = Object.entries(carriers).map(([id, c]) => ({ id, name: c.name }));
  res.json(list);
});

app.post('/api/send', async (req, res) => {
  const { number, carrier, message } = req.body || {};

  const digits = cleanNumber(number);
  if (!digits) {
    return res.status(400).json({ error: 'Enter a valid 10-digit North American number.' });
  }

  const carrierEntry = carriers[carrier];
  if (!carrierEntry) {
    return res.status(400).json({ error: 'Unknown carrier.' });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  if (message.length > 160) {
    return res.status(400).json({ error: 'Message exceeds 160 characters.' });
  }

  const key = `${digits}:${carrier}`;
  const now = Date.now();
  const last = lastSent.get(key) || 0;
  if (now - last < COOLDOWN_MS) {
    return res.status(429).json({ error: 'That number was just messaged. Wait a minute and try again.' });
  }

  const toAddress = `${digits}@${carrierEntry.suffix}`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toAddress,
      subject: '',
      text: message,
    });
    lastSent.set(key, now);
    res.json({ ok: true, to: toAddress });
  } catch (err) {
    console.error('send failed:', err.message);
    res.status(502).json({ error: 'Send failed. Check SMTP credentials and relay status.' });
  }
});

app.listen(PORT, () => {
  console.log(`email2sms listening on http://localhost:${PORT}`);
});
