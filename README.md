
**Live demo:** https://shubh-sajja.onrender.com# Shubh Sajja

A website where people browse wedding decoration themes and marriage halls, check dates, and send booking enquiries. Vendors log in to manage listings and bookings.

## Run it on your computer

1. Install Node.js 22.13 or newer (the current LTS) from https://nodejs.org
2. Open a terminal in this folder and run:

```
npm install
npm start
```

3. Open http://localhost:3000

The database is a single file, `shubh.db`, created on first run with sample data.

## Sample logins (change before going live)

| Role   | Email                     | Password      |
|--------|---------------------------|---------------|
| Admin  | admin@shubhsajja.local    | admin12345    |
| Vendor | saptarang@example.com     | vendor12345   |
| Vendor | hall.owner@example.com    | vendor12345   |

Vendors sign in at http://localhost:3000/vendor.html. New vendors must be approved by the admin before their listings show on the website.

## Settings (environment variables)

- `PORT`: port to run on, default 3000
- `JWT_SECRET`: a long random string used to sign logins. Set this in production.
- `ADMIN_PASSWORD`: admin password used the first time the database is created
- `DB_FILE`: path of the database file
- `UPLOAD_DIR`: folder where listing photos are saved, default `uploads`
- `BASE_URL`: your website address, used in links inside emails, default `http://localhost:3000`
- `ANTHROPIC_API_KEY`: turns on the AI Smart Planner (see below). Without it the planner still works with simple built-in matching
- `AI_MODEL` (default `claude-haiku-4-5-20251001`) and `AI_DAILY_LIMIT` (default 200 AI calls per day for the whole site)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: email sending settings (see below)
- `DATA_DIR`: one folder for the database and the `uploads` folder, default is the project folder
- `SEED_SAMPLE`: set to `0` to start with only the admin account and no sample vendors or listings
- `SAMPLE_VENDOR_PASSWORD`: password of the sample vendors, default `vendor12345`

## Put it online (Render)

1. Push this project to GitHub.
2. On https://render.com click **New**, then **Web Service**, and connect your GitHub repository.
3. Use these settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
   - **Health Check Path** (under Advanced): `/healthz`
4. Add these environment variables:

| Name | Value |
|------|-------|
| `NODE_VERSION` | `22` |
| `ADMIN_PASSWORD` | a strong password you choose, 10 or more characters |
| `JWT_SECRET` | a long random text, 32 or more characters (create one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `BASE_URL` | your site address, for example `https://shubh-sajja.onrender.com` (add it after the first deploy) |

5. Click **Create Web Service**. After a few minutes your site is live at the address Render shows.

The site refuses to start online without `ADMIN_PASSWORD` and `JWT_SECRET`, so the weak test passwords can never go live by mistake.

**Free plan limits:** the site goes to sleep after 15 minutes without visitors, so the first page load can take about a minute. The database and uploaded photos are also reset when the site restarts or you deploy again, and the sample data comes back. This is fine for a demo. For real customers, add a persistent disk on a paid plan, set `DATA_DIR` to the disk's path, and set `SEED_SAMPLE=0`.

## Email alerts

When a customer sends an enquiry, the vendor gets an email with the customer's name, phone, date and guest count. If the customer gave an email, they get a receipt, and another email when the vendor confirms, rejects or cancels.

Until you add email settings, emails are printed in the terminal instead of sent, so you can see exactly what would go out. To send real emails, set these before `npm start`. Gmail example (use an app password, not your normal password; create one at https://myaccount.google.com/apppasswords):

```
set SMTP_HOST=smtp.gmail.com
set SMTP_PORT=587
set SMTP_USER=youraddress@gmail.com
set SMTP_PASS=your-16-letter-app-password
set MAIL_FROM=Shubh Sajja <youraddress@gmail.com>
npm start
```

On Mac or Linux, use `export` instead of `set`. A failed email never stops a booking from being saved.

## AI Smart Planner
A box on the home page where a customer types, in plain words, something like
"Wedding in Pune on 15 December, 400 guests, budget 3 lakh, need a hall and a mandap".

1. **Understand:** Claude reads the text and returns city, date, guests, budget and wanted themes as JSON. Every value is checked against the real list of cities and themes before use. If there is no API key, or the call fails, a simple built-in reader does this step.
2. **Match:** plain code (not the AI) filters the real listings: free on the date, hall big enough, within budget (with a hall plus decoration, each may use what is left after the cheapest option of the other kind). The AI cannot invent a hall, a price or a free date.
3. **Explain:** Claude writes a short summary using only the matched listings. The combined price is calculated in code and given to the AI.

Safety: the key stays on the server, customer text is treated as data, calls time out after 12 seconds, requests are rate limited, and `AI_DAILY_LIMIT` caps daily AI calls so a bill cannot run away.

To turn on the AI, set `ANTHROPIC_API_KEY` (get a key at console.anthropic.com). The "AI on" badge appears on the page when it is active.

## Photos

Vendors open My listings, click Edit on a listing, and upload JPG, PNG or WebP photos (10 MB each, 8 per listing). The first photo becomes the cover on the website. Without photos, the website shows a drawing. Photos are saved in the `uploads` folder, so back it up together with `shubh.db`.

## How booking works

- A customer sends an enquiry for a listing and date. It is saved as `pending` and the date is held.
- The database refuses a second active booking for the same listing and date, so double booking cannot happen.
- The vendor confirms, rejects or cancels it. Rejecting or cancelling frees the date.
- Vendors can also block dates for bookings made outside the website.

## Files

- `server.js`: the API and the web server
- `db.js`: database tables and sample data
- `mailer.js`: sends the email alerts
- `public/index.html`: customer website
- `public/vendor.html`: vendor and admin dashboard

## Not built yet

Online payment, SMS or WhatsApp alerts, and customer accounts.
