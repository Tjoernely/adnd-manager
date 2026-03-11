const express  = require('express');
const cors     = require('cors');
const path     = require('path');

const { router: authRouter } = require('./routes/auth');
const campaignRouter         = require('./routes/campaigns');
const characterRouter        = require('./routes/characters');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRouter);
app.use('/api/campaigns',  campaignRouter);
app.use('/api/characters', characterRouter);

// ── Serve React frontend (production build) ────────────────────────────────────
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`AD&D Manager running on http://localhost:${PORT}`);
});
