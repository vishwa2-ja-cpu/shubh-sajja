const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, 'shubh.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('vendor','admin')),
  business_name TEXT NOT NULL,
  phone TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('decor','hall')),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  theme TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  description TEXT NOT NULL DEFAULT '',
  includes TEXT NOT NULL DEFAULT '[]',
  capacity INTEGER,
  rooms INTEGER,
  parking INTEGER,
  ac INTEGER NOT NULL DEFAULT 0,
  motif TEXT NOT NULL DEFAULT 'stage',
  palette TEXT NOT NULL DEFAULT '["#f6d27a","#b3264f","#7a1236"]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  event_date TEXT NOT NULL,
  guests INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','cancelled','blocked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- The database itself refuses a second active booking for the same listing and date.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_day
  ON bookings(listing_id, event_date) WHERE status IN ('pending','confirmed','blocked');
CREATE TABLE IF NOT EXISTS listing_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_photos_listing ON listing_photos(listing_id);
CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
`);

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;
  const adminPass = process.env.ADMIN_PASSWORD || 'admin12345';
  const vendorPass = 'vendor12345';
  const addUser = db.prepare('INSERT INTO users (email,password_hash,role,business_name,phone,approved) VALUES (?,?,?,?,?,1)');
  addUser.run('admin@shubhsajja.local', bcrypt.hashSync(adminPass, 10), 'admin', 'Shubh Sajja Admin', '');
  const v = (email, name, phone) => addUser.run(email, bcrypt.hashSync(vendorPass, 10), 'vendor', name, phone).lastInsertRowid;
  const v1 = v('saptarang@example.com', 'Saptarang Decorators', '9800000001');
  const v2 = v('hall.owner@example.com', 'Laxmi Hospitality', '9800000002');
  const v3 = v('nashik.events@example.com', 'Nashik Events Group', '9800000003');

  const add = db.prepare(`INSERT INTO listings
    (vendor_id,type,name,city,theme,price,description,includes,capacity,rooms,parking,ac,motif,palette)
    VALUES (@vendor_id,@type,@name,@city,@theme,@price,@description,@includes,@capacity,@rooms,@parking,@ac,@motif,@palette)`);
  const L = (o) => add.run({ capacity: null, rooms: null, parking: null, ac: 0, ...o,
    includes: JSON.stringify(o.includes), palette: JSON.stringify(o.palette) }).lastInsertRowid;

  const ids = {};
  ids.d1 = L({ vendor_id: v1, type: 'decor', name: 'Royal Rajwada Mandap', city: 'Pune', theme: 'Mandap', price: 185000, motif: 'mandap', palette: ['#f6d27a','#b3264f','#7a1236'], description: 'A carved-pillar mandap with deep red drapes, gold trim and fresh marigold garlands. Built for full-day wedding ceremonies.', includes: ['Mandap with 4 pillars and canopy','Fresh marigold and rose garlands','Bride and groom seating','Aisle runner and 2 entry pillars'] });
  L({ vendor_id: v1, type: 'decor', name: 'Marigold Haldi Corner', city: 'Pune', theme: 'Haldi', price: 35000, motif: 'haldi', palette: ['#fde68a','#f59e0b','#b45309'], description: 'A bright yellow haldi setup with a hanging marigold backdrop, low seating and a flower-petal floor.', includes: ['Hanging flower backdrop','Low cushion seating','Brass urli and petals','Photo corner'] });
  L({ vendor_id: v3, type: 'decor', name: 'Mehendi Boho Lounge', city: 'Nashik', theme: 'Mehendi', price: 48000, motif: 'mehendi', palette: ['#c7e3b0','#4d8f4a','#25522a'], description: 'Green and gold lounge seating with jharokha frames, cushions and hanging lanterns for the mehendi evening.', includes: ['Floor seating for 40','Lantern canopy','Jharokha photo frames','Mehendi artist stations (2)'] });
  L({ vendor_id: v1, type: 'decor', name: 'Grand Floral Entrance Gate', city: 'Mumbai', theme: 'Entrance', price: 65000, motif: 'entrance', palette: ['#f9d3e0','#d6336c','#8b1a45'], description: 'A tall floral arch with rose and orchid clusters to welcome guests, with matching pathway lights.', includes: ['12 ft floral arch','Pathway lights and lamps','Welcome board','Petal shower tray'] });
  L({ vendor_id: v1, type: 'decor', name: 'Pastel Rose Stage', city: 'Kolhapur', theme: 'Stage', price: 95000, motif: 'stage', palette: ['#fbe3ea','#e58aa5','#a23b5f'], description: 'A soft pink reception stage with a round floral backdrop, sofa seating and a draped canopy ceiling.', includes: ['Stage 20 x 12 ft','Round floral backdrop','Sofa set and side tables','Ceiling drape and fairy lights'] });
  L({ vendor_id: v1, type: 'decor', name: 'Fairy Light Sangeet Canopy', city: 'Mumbai', theme: 'Sangeet', price: 120000, motif: 'lights', palette: ['#2d1b4e','#6b3fa0','#ffd166'], description: 'A dance floor canopy covered in warm string lights, with truss, a lit stage and lounge seating.', includes: ['Light canopy over dance floor','Stage with LED wall frame','Lounge seating','Standing cocktail tables'] });
  L({ vendor_id: v1, type: 'decor', name: 'Temple-Style South Indian Mandap', city: 'Pune', theme: 'Mandap', price: 150000, motif: 'mandap', palette: ['#fff0c2','#e0a100','#7b4a00'], description: 'A traditional kalyana mandap with banana stems, jasmine strings and brass lamps, set for a morning muhurat.', includes: ['Mandap with banana stem pillars','Jasmine and flower strings','Brass lamps and kalash','Priest seating'] });
  L({ vendor_id: v3, type: 'decor', name: 'White Orchid Reception Stage', city: 'Nashik', theme: 'Stage', price: 210000, motif: 'stage', palette: ['#f4f1f8','#c9b8e4','#6a4c93'], description: 'A modern white and lilac stage with imported orchids, crystal hangings and a mirrored floor.', includes: ['Stage 24 x 14 ft','Imported orchid arrangements','Crystal hangings','Mirror floor and spotlights'] });

  ids.h1 = L({ vendor_id: v2, type: 'hall', name: 'Shree Laxmi Lawns', city: 'Pune', theme: 'Lawn', price: 90000, capacity: 800, parking: 200, rooms: 6, ac: 0, motif: 'hall', palette: ['#bfe3c0','#3f8f55','#1f5a33'], description: 'An open lawn with a covered stage area, near Hinjewadi. Good for daytime and evening functions.', includes: ['Lawn for up to 800 guests','Parking for 200 cars','6 changing rooms','Generator backup'] });
  L({ vendor_id: v2, type: 'hall', name: 'Raj Mahal Banquet', city: 'Mumbai', theme: 'Banquet', price: 220000, capacity: 500, parking: 60, rooms: 10, ac: 1, motif: 'hall', palette: ['#f8dca0','#b8791a','#6b3f05'], description: 'A fully air-conditioned banquet in Thane with chandeliers, a bridal suite and in-house catering.', includes: ['AC hall for 500 guests','10 guest rooms','Bridal suite','In-house catering available'] });
  L({ vendor_id: v3, type: 'hall', name: 'Sahyadri Garden Hall', city: 'Nashik', theme: 'Lawn', price: 110000, capacity: 1200, parking: 300, rooms: 8, ac: 0, motif: 'hall', palette: ['#d6ecc0','#5b9a3a','#2e5a1a'], description: 'A large garden venue with a permanent stage and a separate dining hall, close to the Mumbai-Agra road.', includes: ['Garden for 1,200 guests','Separate dining hall','300-car parking','8 rooms'] });
  L({ vendor_id: v2, type: 'hall', name: 'Panchganga Mangal Karyalay', city: 'Kolhapur', theme: 'Mangal Karyalay', price: 70000, capacity: 600, parking: 100, rooms: 5, ac: 0, motif: 'hall', palette: ['#ffe2b8','#e07a1f','#8a3d05'], description: 'A traditional mangal karyalay with a large hall, dining space and kitchen, a short drive from the city centre.', includes: ['Hall for 600 guests','Dining area and kitchen','5 rooms','Priest room'] });
  L({ vendor_id: v2, type: 'hall', name: 'The Pearl Convention', city: 'Pune', theme: 'Banquet', price: 260000, capacity: 1500, parking: 400, rooms: 20, ac: 1, motif: 'hall', palette: ['#e7e3f4','#8a78c6','#41337a'], description: 'A convention-style AC hall with two connected halls, valet parking and a poolside lawn for functions.', includes: ['AC hall for 1,500 guests','Poolside lawn','400-car parking with valet','20 rooms'] });
  L({ vendor_id: v3, type: 'hall', name: 'Godavari Heritage Wada', city: 'Nashik', theme: 'Heritage', price: 150000, capacity: 350, parking: 40, rooms: 12, ac: 0, motif: 'hall', palette: ['#f1d3b0','#a8602a','#5a2d0c'], description: 'A restored wada with a stone courtyard for the ceremony. Suited to smaller, traditional weddings.', includes: ['Courtyard for 350 guests','12 heritage rooms','Wooden stage and jharokha','Riverside photo spots'] });

  // A few already-taken dates so the date check has something to show.
  const blk = db.prepare("INSERT INTO bookings (listing_id,customer_name,phone,event_date,status) VALUES (?,?,?,?,?)");
  blk.run(ids.d1, 'Sample customer', '9000000000', '2026-11-22', 'confirmed');
  blk.run(ids.d1, 'Sample customer', '9000000000', '2026-12-06', 'confirmed');
  blk.run(ids.h1, 'Sample customer', '9000000000', '2026-11-22', 'confirmed');
  blk.run(ids.h1, 'Sample customer', '9000000000', '2026-11-29', 'confirmed');
}
seed();

module.exports = db;
