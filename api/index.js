require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const connectDB = require('../config/db');
require('../config/firebase'); // fails fast at boot if Firebase env vars are missing/invalid
const initSockets = require('../sockets');

const authRoutes = require('../routes/auth');
const userRoutes = require('../routes/users');
const providerRoutes = require('../routes/providers');
const requestRoutes = require('../routes/requests');
const sosRoutes = require('../routes/sos');
const reviewRoutes = require('../routes/reviews');
const notificationRoutes = require('../routes/notifications');

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5000').split(',').map(o => o.trim());

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});
app.set('io', io); // lets route handlers emit socket events via req.app.get('io')

// ─── Global middleware ───────────────────────────────────────────────────────

// Helmet with relaxed CSP for serving our own HTML+JS (allows CDN scripts)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",  // needed for inline scripts in index.html / login.html
          'https://cdn.tailwindcss.com',
          'https://cdnjs.cloudflare.com',
          'https://fonts.googleapis.com',
          'https://www.gstatic.com',
          'https://cdn.socket.io',
          'https://maps.googleapis.com',
          'https://maps.gstatic.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.google.com', 'https://firebaseinstallations.googleapis.com', 'https://securetoken.googleapis.com', 'https://identitytoolkit.googleapis.com', 'wss:', 'ws:'],
        frameSrc: ['https://accounts.google.com', 'https://*.firebaseapp.com'],  // Google Sign-In popup
        objectSrc: ["'none'"],
      },
    },
  })
);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 300 : 2000,  // relaxed in dev
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/socket.io'), // don't rate-limit socket polling
    message: { success: false, message: 'Too many requests — please try again later.' },
  })
);

// Stricter rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many authentication attempts — please try again in 15 minutes.' },
});

// ─── Serve frontend HTML and static assets ──────────────────────────────────
app.use(express.static(path.resolve(__dirname, '../public')));

// ─── Serve Firebase browser SDK from local node_modules (no CDN needed) ─────
// Accessible at /vendor/firebase/firebase-app-compat.js etc.
app.use('/vendor/firebase', express.static(path.resolve(__dirname, '../node_modules/firebase')));

// ─── Firebase client config endpoint ────────────────────────────────────────
// Exposes ONLY the browser-safe Firebase config vars (not Admin SDK secrets).
app.get('/api/config/firebase', (req, res) => {
  const { FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_APP_ID, FIREBASE_MESSAGING_SENDER_ID } = process.env;
  if (!FIREBASE_API_KEY) {
    return res.status(503).json({ success: false, message: 'Firebase client config not configured on server' });
  }
  res.json({
    success: true,
    data: {
      apiKey: FIREBASE_API_KEY,
      authDomain: FIREBASE_AUTH_DOMAIN,
      projectId: FIREBASE_PROJECT_ID,
      appId: FIREBASE_APP_ID,
      messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
    },
  });
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), env: process.env.NODE_ENV || 'development' }));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);

// ─── SPA fallback (serve index.html for any unknown GET) ────────────────────
app.get('*', (req, res, next) => {
  // Only fall back for non-API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

// ─── Central error handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err.message);
  // Never leak stack traces in production
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(err.status || 500).json({ success: false, message });
});

// ─── 404 fallback ────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// ─── Socket.IO ───────────────────────────────────────────────────────────────
initSockets(io);

// ─── Database + server start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  // Handle port-in-use error gracefully (never crash with unhandled 'error' event)
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[server] ❌ Port ${PORT} is already in use.`);
      console.error('[server] Another RoadResQ instance is running. Fix:');
      console.error(`[server]   Run this in PowerShell:  Stop-Process -Name node -Force`);
      console.error(`[server]   Then restart:            npm run dev\n`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  server.listen(PORT, () => {
    console.log(`[server] RoadResQ listening on :${PORT}`);
    console.log(`[server] Open → http://localhost:${PORT}/login.html`);
  });
}

// Connect to MongoDB after server is already listening
connectDB();

module.exports = app;

process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled promise rejection:', err);
});
