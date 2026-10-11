const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const { sendMail } = require('./mailer');

const isOnline = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.env.DATA_DIR || __dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const BASE_URL = (process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/$/, '');
const MAX_PHOTOS = 8;

const app = express();
if (isOnline) app.set('trust proxy', 1); // behind the host's proxy, so the real visitor IP is used for rate limits
app.use(express.json({ limit: '50kb' }));

let SECRET = process.env.JWT_SECRET;
if (!SECRET && isOnline) {
  console.error('Stopped: set the JWT_SECRET setting to a long random text (at least 32 characters).');
  process.exit(1);
}
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET is not set. Using a temporary one, so vendors are signed out on every restart.');
}

// ---------- small helpers ----------
const niceDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const today = () => new Date().toISOString().slice(0, 10);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const clean = (s, max = 200) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// Very simple in-memory rate limiter: max `n` requests per minute per IP and route group.
function limit(n) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < 60000);
    if (arr.length >= n) return bad(res, 'Too many requests. Please wait a minute and try again.', 429);
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}

function shapeListing(r, busy = [], photos = []) {
  return {
    id: r.id, type: r.type, name: r.name, vendor: r.business_name, city: r.city, theme: r.theme,
    price: r.price, desc: r.description, inc: JSON.parse(r.includes),
    cap: r.capacity, rooms: r.rooms, parking: r.parking, ac: !!r.ac,
    motif: r.motif, pal: JSON.parse(r.palette), busy, photos,
  };
}
const photosOf = (id) =>
  db.prepare('SELECT id, filename FROM listing_photos WHERE listing_id=? ORDER BY id').all(id).map((p) => ({ id: p.id, url: '/uploads/' + p.filename }));
const busyDates = (id) =>
  db.prepare("SELECT event_date FROM bookings WHERE listing_id=? AND status IN ('pending','confirmed','blocked') AND event_date>=? ORDER BY event_date")
    .all(id, today()).map((x) => x.event_date);

// ---------- public API ----------
const PUBLIC_LISTING_SQL = `SELECT l.*, u.business_name, u.email AS vendor_email FROM listings l JOIN users u ON u.id=l.vendor_id
  WHERE l.active=1 AND u.approved=1`;

app.get('/api/listings', (req, res) => {
  const rows = db.prepare(PUBLIC_LISTING_SQL + ' ORDER BY l.type, l.price').all();
  res.json(rows.map((r) => shapeListing(r, busyDates(r.id), photosOf(r.id))));
});

app.get('/api/listings/:id', (req, res) => {
  const r = db.prepare(PUBLIC_LISTING_SQL + ' AND l.id=?').get(req.params.id);
  if (!r) return bad(res, 'Listing not found.', 404);
  res.json(shapeListing(r, busyDates(r.id), photosOf(r.id)));
});

app.post('/api/bookings', limit(10), (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), phone = clean(b.phone, 10), email = clean(b.email, 120), note = clean(b.note, 500);
  const guests = b.guests === '' || b.guests == null ? null : Number(b.guests);
  if (!name) return bad(res, 'Enter your name.');
  if (!/^[6-9]\d{9}$/.test(phone)) return bad(res, 'Enter a valid 10-digit mobile number.');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 'Enter a valid email or leave it empty.');
  if (!isDate(b.date)) return bad(res, 'Choose your event date.');
  if (b.date < today()) return bad(res, 'The event date cannot be in the past.');
  if (guests !== null && (!Number.isInteger(guests) || guests < 1 || guests > 20000)) return bad(res, 'Enter a valid guest count.');

  const l = db.prepare(PUBLIC_LISTING_SQL + ' AND l.id=?').get(Number(b.listingId));
  if (!l) return bad(res, 'This listing is not available.', 404);
  if (l.type === 'hall' && guests && l.capacity && guests > l.capacity)
    return bad(res, `${l.name} holds up to ${l.capacity} guests.`);

  try {
    const info = db.prepare('INSERT INTO bookings (listing_id,customer_name,phone,email,event_date,guests,note) VALUES (?,?,?,?,?,?,?)')
      .run(l.id, name, phone, email || null, b.date, guests, note || null);
    const when = niceDate(b.date);
    sendMail({
      to: l.vendor_email,
      subject: `New enquiry for ${l.name} on ${when}`,
      text: `You have a new enquiry on Shubh Sajja.\n\nListing: ${l.name}\nEvent date: ${when}\nCustomer: ${name}\nPhone: ${phone}\n${email ? 'Email: ' + email + '\n' : ''}${guests ? 'Guests: ' + guests + '\n' : ''}${note ? 'Note: ' + note + '\n' : ''}\nPlease call the customer, then confirm or reject the enquiry here:\n${BASE_URL}/vendor.html\n`,
    });
    sendMail({
      to: email,
      subject: `We received your enquiry for ${l.name}`,
      text: `Hello ${name},\n\nYour enquiry for ${l.name} on ${when} (reference #${info.lastInsertRowid}) has been sent to ${l.business_name}. They will call you on ${phone} to confirm.\n\nShubh Sajja\n`,
    });
    res.status(201).json({ id: info.lastInsertRowid, status: 'pending', message: 'Enquiry received. The vendor will call you to confirm.' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return bad(res, `${l.name} is already booked on that date. Choose another date.`, 409);
    console.error(e); bad(res, 'Something went wrong. Please try again.', 500);
  }
});

// ---------- auth ----------
const sign = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role, businessName: u.business_name, phone: u.phone, approved: !!u.approved });

app.post('/api/auth/register', limit(10), (req, res) => {
  const b = req.body || {};
  const email = clean(b.email, 120).toLowerCase(), business = clean(b.businessName, 100), phone = clean(b.phone, 10);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 'Enter a valid email.');
  if (!business) return bad(res, 'Enter your business name.');
  if (!/^[6-9]\d{9}$/.test(phone)) return bad(res, 'Enter a valid 10-digit mobile number.');
  if (typeof b.password !== 'string' || b.password.length < 8) return bad(res, 'Password must be at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return bad(res, 'This email is already registered.', 409);
  const info = db.prepare("INSERT INTO users (email,password_hash,role,business_name,phone,approved) VALUES (?,?,'vendor',?,?,0)")
    .run(email, bcrypt.hashSync(b.password, 10), business, phone);
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json({ token: sign(u), user: publicUser(u) });
});

app.post('/api/auth/login', limit(10), (req, res) => {
  const email = clean((req.body || {}).email, 120).toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !bcrypt.compareSync(String((req.body || {}).password || ''), u.password_hash))
    return bad(res, 'Wrong email or password.', 401);
  res.json({ token: sign(u), user: publicUser(u) });
});

function auth(roles) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    try {
      const p = jwt.verify(h.replace(/^Bearer /, ''), SECRET);
      const u = db.prepare('SELECT * FROM users WHERE id=?').get(p.id);
      if (!u) throw new Error('no user');
      if (roles && !roles.includes(u.role)) return bad(res, 'Not allowed.', 403);
      req.user = u; next();
    } catch { bad(res, 'Please sign in.', 401); }
  };
}
app.get('/api/me', auth(), (req, res) => res.json(publicUser(req.user)));

// ---------- vendor API ----------
const vendor = auth(['vendor']);

function readListing(b, type) {
  const o = {
    type, name: clean(b.name, 100), city: clean(b.city, 60), theme: clean(b.theme, 40),
    price: Number(b.price), description: clean(b.description, 1000),
    includes: Array.isArray(b.includes) ? b.includes.map((x) => clean(x, 120)).filter(Boolean).slice(0, 12) : [],
    capacity: null, rooms: null, parking: null, ac: b.ac ? 1 : 0,
    motif: ['mandap', 'stage', 'entrance', 'haldi', 'mehendi', 'lights', 'hall'].includes(b.motif) ? b.motif : (type === 'hall' ? 'hall' : 'stage'),
  };
  if (!o.name || !o.city || !o.theme) return { error: 'Name, city and theme are required.' };
  if (!Number.isInteger(o.price) || o.price < 0 || o.price > 100000000) return { error: 'Enter a valid price in rupees.' };
  if (type === 'hall') {
    o.capacity = Number(b.capacity); o.rooms = Number(b.rooms || 0); o.parking = Number(b.parking || 0);
    if (!Number.isInteger(o.capacity) || o.capacity < 1) return { error: 'Enter how many guests the hall holds.' };
    if (![o.rooms, o.parking].every((n) => Number.isInteger(n) && n >= 0)) return { error: 'Rooms and parking must be whole numbers.' };
  }
  return { o };
}
const PALETTES = { mandap: ['#f6d27a', '#b3264f', '#7a1236'], stage: ['#fbe3ea', '#e58aa5', '#a23b5f'], entrance: ['#f9d3e0', '#d6336c', '#8b1a45'], haldi: ['#fde68a', '#f59e0b', '#b45309'], mehendi: ['#c7e3b0', '#4d8f4a', '#25522a'], lights: ['#2d1b4e', '#6b3fa0', '#ffd166'], hall: ['#f8dca0', '#b8791a', '#6b3f05'] };

app.get('/api/vendor/listings', vendor, (req, res) => {
  const rows = db.prepare('SELECT l.*, ? AS business_name FROM listings l WHERE vendor_id=? ORDER BY id DESC').all(req.user.business_name, req.user.id);
  res.json(rows.map((r) => ({ ...shapeListing(r, busyDates(r.id), photosOf(r.id)), active: !!r.active })));
});

app.post('/api/vendor/listings', vendor, (req, res) => {
  const type = req.body && req.body.type === 'hall' ? 'hall' : 'decor';
  const { o, error } = readListing(req.body || {}, type);
  if (error) return bad(res, error);
  const info = db.prepare(`INSERT INTO listings (vendor_id,type,name,city,theme,price,description,includes,capacity,rooms,parking,ac,motif,palette)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id, o.type, o.name, o.city, o.theme, o.price, o.description, JSON.stringify(o.includes), o.capacity, o.rooms, o.parking, o.ac, o.motif, JSON.stringify(PALETTES[o.motif]));
  res.status(201).json({ id: info.lastInsertRowid });
});

function ownListing(req, res) {
  const l = db.prepare('SELECT * FROM listings WHERE id=? AND vendor_id=?').get(req.params.id, req.user.id);
  if (!l) bad(res, 'Listing not found.', 404);
  return l;
}

app.put('/api/vendor/listings/:id', vendor, (req, res) => {
  const l = ownListing(req, res); if (!l) return;
  const { o, error } = readListing(req.body || {}, l.type);
  if (error) return bad(res, error);
  db.prepare(`UPDATE listings SET name=?,city=?,theme=?,price=?,description=?,includes=?,capacity=?,rooms=?,parking=?,ac=?,motif=?,palette=?,active=? WHERE id=?`)
    .run(o.name, o.city, o.theme, o.price, o.description, JSON.stringify(o.includes), o.capacity, o.rooms, o.parking, o.ac, o.motif, JSON.stringify(PALETTES[o.motif]), req.body.active === false ? 0 : 1, l.id);
  res.json({ ok: true });
});

app.delete('/api/vendor/listings/:id', vendor, (req, res) => {
  const l = ownListing(req, res); if (!l) return;
  const files = db.prepare('SELECT filename FROM listing_photos WHERE listing_id=?').all(l.id);
  db.prepare('DELETE FROM listings WHERE id=?').run(l.id);
  files.forEach((f) => fs.unlink(path.join(UPLOAD_DIR, f.filename), () => {}));
  res.json({ ok: true });
});

// ---------- photos ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5 } });
function imageType(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 12 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}
app.post('/api/vendor/listings/:id/photos', vendor, (req, res) => {
  const l = ownListing(req, res); if (!l) return;
  upload.array('photos', 5)(req, res, (err) => {
    if (err) return bad(res, err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be 10 MB or smaller.' : 'Could not read the upload. Send up to 5 photos.');
    const files = req.files || [];
    if (!files.length) return bad(res, 'Choose at least one photo.');
    const have = db.prepare('SELECT COUNT(*) c FROM listing_photos WHERE listing_id=?').get(l.id).c;
    if (have + files.length > MAX_PHOTOS) return bad(res, `A listing can have up to ${MAX_PHOTOS} photos. It has ${have} now.`);
    const types = files.map((f) => imageType(f.buffer));
    if (types.includes(null)) return bad(res, 'Only JPG, PNG or WebP photos are allowed.');
    const ins = db.prepare('INSERT INTO listing_photos (listing_id, filename) VALUES (?,?)');
    files.forEach((f, i) => {
      const name = crypto.randomBytes(12).toString('hex') + types[i];
      fs.writeFileSync(path.join(UPLOAD_DIR, name), f.buffer);
      ins.run(l.id, name);
    });
    res.status(201).json({ photos: photosOf(l.id) });
  });
});
app.delete('/api/vendor/photos/:id', vendor, (req, res) => {
  const p = db.prepare('SELECT p.* FROM listing_photos p JOIN listings l ON l.id=p.listing_id WHERE p.id=? AND l.vendor_id=?').get(req.params.id, req.user.id);
  if (!p) return bad(res, 'Photo not found.', 404);
  db.prepare('DELETE FROM listing_photos WHERE id=?').run(p.id);
  fs.unlink(path.join(UPLOAD_DIR, p.filename), () => {});
  res.json({ ok: true });
});

app.get('/api/vendor/bookings', vendor, (req, res) => {
  res.json(db.prepare(`SELECT b.*, l.name AS listing_name FROM bookings b JOIN listings l ON l.id=b.listing_id
    WHERE l.vendor_id=? ORDER BY b.event_date, b.id`).all(req.user.id));
});

const NEXT = { pending: ['confirmed', 'rejected', 'cancelled'], confirmed: ['cancelled'] };
app.patch('/api/vendor/bookings/:id', vendor, (req, res) => {
  const b = db.prepare('SELECT b.* FROM bookings b JOIN listings l ON l.id=b.listing_id WHERE b.id=? AND l.vendor_id=?').get(req.params.id, req.user.id);
  if (!b) return bad(res, 'Booking not found.', 404);
  const to = (req.body || {}).status;
  if (!(NEXT[b.status] || []).includes(to)) return bad(res, `A ${b.status} booking cannot be changed to ${to}.`);
  db.prepare('UPDATE bookings SET status=? WHERE id=?').run(to, b.id);
  if (b.email) {
    const l = db.prepare('SELECT name FROM listings WHERE id=?').get(b.listing_id);
    const msg = { confirmed: 'has been confirmed', rejected: 'could not be accepted. Please choose another date or another listing', cancelled: 'has been cancelled' }[to];
    sendMail({
      to: b.email,
      subject: `Your booking for ${l.name} ${to === 'confirmed' ? 'is confirmed' : 'was ' + to}`,
      text: `Hello ${b.customer_name},\n\nYour booking for ${l.name} on ${niceDate(b.event_date)} (reference #${b.id}) ${msg}.\n\nShubh Sajja\n`,
    });
  }
  res.json({ ok: true });
});

app.post('/api/vendor/block', vendor, (req, res) => {
  const { listingId, date } = req.body || {};
  if (!isDate(date) || date < today()) return bad(res, 'Choose a future date.');
  const l = db.prepare('SELECT * FROM listings WHERE id=? AND vendor_id=?').get(Number(listingId), req.user.id);
  if (!l) return bad(res, 'Listing not found.', 404);
  try {
    db.prepare("INSERT INTO bookings (listing_id,customer_name,phone,event_date,status) VALUES (?,?,?,?,'blocked')").run(l.id, 'Blocked by vendor', '0000000000', date);
    res.status(201).json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return bad(res, 'That date already has a booking or block.', 409);
    bad(res, 'Something went wrong.', 500);
  }
});

app.delete('/api/vendor/bookings/:id', vendor, (req, res) => {
  const r = db.prepare(`DELETE FROM bookings WHERE id=? AND status='blocked' AND listing_id IN (SELECT id FROM listings WHERE vendor_id=?)`).run(req.params.id, req.user.id);
  r.changes ? res.json({ ok: true }) : bad(res, 'Only a blocked date can be removed here.', 404);
});

// ---------- admin API ----------
const admin = auth(['admin']);
app.get('/api/admin/vendors', admin, (req, res) => {
  res.json(db.prepare("SELECT id,email,business_name,phone,approved,created_at FROM users WHERE role='vendor' ORDER BY approved, id DESC").all());
});
app.patch('/api/admin/vendors/:id', admin, (req, res) => {
  const r = db.prepare("UPDATE users SET approved=? WHERE id=? AND role='vendor'").run((req.body || {}).approved ? 1 : 0, req.params.id);
  r.changes ? res.json({ ok: true }) : bad(res, 'Vendor not found.', 404);
});
app.get('/api/admin/bookings', admin, (req, res) => {
  res.json(db.prepare(`SELECT b.*, l.name AS listing_name, u.business_name FROM bookings b
    JOIN listings l ON l.id=b.listing_id JOIN users u ON u.id=l.vendor_id WHERE b.status!='blocked' ORDER BY b.id DESC LIMIT 200`).all());
});

app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use('/api', (req, res) => bad(res, 'Not found.', 404));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));
app.use(express.static(path.join(__dirname, 'public')));

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Shubh Sajja running at http://localhost:${port}`));
}
module.exports = app;
