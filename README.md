# Shubh Sajja

A website where people browse wedding decoration themes and marriage halls, check dates, and send booking enquiries. Vendors log in to manage listings and bookings.

## Run it on your computer

1. Install Node.js 18 or newer from https://nodejs.org
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
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: email sending settings (see below)

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

## Photos

Vendors open My listings, click Edit on a listing, and upload JPG, PNG or WebP photos (3 MB each, 8 per listing). The first photo becomes the cover on the website. Without photos, the website shows a drawing. Photos are saved in the `uploads` folder, so back it up together with `shubh.db`.

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
