# email2sms

Sends SMS to any North American phone number through carrier email-to-SMS
gateways. This is a standalone Node/Express service, **not** part of the
static GitHub Pages site in the repository root. It requires a real SMTP
relay you are authorized to send through, and it cannot run on GitHub
Pages (Pages serves static files only, no server-side code, no secrets).

## Requirements

- Node.js 18+
- SMTP credentials for a relay you control or are authorized to use.
  Do not point this at a third-party open relay you don't control; using
  someone else's misconfigured relay is mail abuse and will get the
  sending IP blacklisted.

## Setup

```bash
cd email2sms
cp .env.example .env
# edit .env with your SMTP host/port/user/pass
npm install
npm start
```

Then open `http://localhost:3000` (or whatever `PORT` you set).

## What it does

- `GET /api/carriers` returns the carrier list from `carriers.json`.
- `POST /api/send` takes `{ number, carrier, message }`, validates the
  number and message length (160 chars max), and emails
  `{number}@{carrier-gateway}` through the configured SMTP relay.
- Rate limited to 30 sends/hour per IP, plus a 60s cooldown per
  number+carrier pair to prevent spam-bombing a single target.

## Carrier gateway list

`carriers.json` holds the North American carrier email-to-SMS suffixes
(Rogers, Bell, Telus, AT&T, Verizon, T-Mobile, etc.), sourced from the
cubiclesoft `email_sms_mms_gateways` list. These addresses drift over
time and some carriers now filter or reject unauthenticated/bulk-looking
mail. Test with your own number on your own carrier before relying on
this for anything real.

## Deploying

Since this needs a persistent Node process and SMTP secrets, it should
run on a server you control, not GitHub Pages. An Unraid Docker
container or any small VPS works. Keep `.env` out of version control
(already in `.gitignore`) and `chmod 600` it on the host.
