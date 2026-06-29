// IMPORTANT: explicit path so dotenv finds server/.env even when PM2 is
// launched from a different cwd. Without this, `require('dotenv').config()`
// looked in process.cwd() and silently loaded zero vars — which meant
// NODE_ENV was undefined when middleware/rate-limit.js was required two
// lines below, and the limiters ran with their dev caps in production.
const path     = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const { loginLimiter, registerLimiter, aiLimiter, imageLimiter } = require('./middleware/rate-limit');

const autoMigrate            = require('./auto-migrate');
const { router: authRouter } = require('./routes/auth');
const campaignRouter         = require('./routes/campaigns');
const characterRouter        = require('./routes/characters');
const npcRouter              = require('./routes/npcs');
const spellRouter            = require('./routes/spells');
const questRouter            = require('./routes/quests');
const encounterRouter        = require('./routes/encounters');
const lootRouter             = require('./routes/loot');
const magicalItemsRouter     = require('./routes/magicalItems');
const monstersRouter         = require('./routes/monsters');
const mapRouter              = require('./routes/maps');
const mapConnectorsRouter    = require('./routes/map_connectors');
const partyKnowledgeRouter   = require('./routes/party-knowledge');
const partyHubRouter         = require('./routes/party-hub');
const partyInventoryRouter   = require('./routes/party-inventory');
const savedEncountersRouter  = require('./routes/saved-encounters');
const aiRouter               = require('./routes/ai');
const partyEquipmentRouter   = require('./routes/party-equipment');
const characterEquipmentRouter = require('./routes/character-equipment');
const characterSpellsRouter  = require('./routes/character-spells');
const weaponsCatalogRouter   = require('./routes/weapons-catalog');
const armorCatalogRouter     = require('./routes/armor-catalog');
const webhookRouter          = require('./routes/webhook');
const proficienciesRouter    = require('./routes/proficiencies');
const kitsRouter             = require('./routes/kits');
const adminRouter            = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────────
// trust proxy = 1 so req.ip reflects the real client behind nginx, not
// the loopback address. Required for the rate-limiters to key on the
// actual offender's IP.
app.set('trust proxy', 1);

// helmet — sets HSTS, X-Frame-Options, X-Content-Type-Options, COOP/CORP,
// and strips X-Powered-By on API responses (defense in depth).
//
// CSP is deliberately DISABLED here. A CSP on /api JSON responses does
// nothing for XSS — the browser enforces CSP from the *document* (the HTML
// page), which is served directly by nginx, not Express. The real CSP now
// lives in nginx on the static HTML + assets (see
// /etc/nginx/snippets/adnd-security.conf, security pass 2026-06-04). Keeping
// a second, contradictory CSP here would only be misleading.
//
// crossOriginEmbedderPolicy is disabled because gpt-image-1 returns
// inline base64 that we re-upload; COEP would block some flows.
app.use(helmet({
  contentSecurityPolicy: false,   // owned by nginx (on the HTML document)
  crossOriginEmbedderPolicy: false,
  // HSTS only takes effect over HTTPS — harmless on plain HTTP but the
  // moment HTTPS lands (TODO: certbot) browsers lock onto it for a year.
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
}));

// CORS — locked allowlist. process.env.CORS_ORIGINS is a comma-separated
// list of origins; falls back to the common local-dev + bare-IP prod
// origins so this stays working without explicit configuration. The old
// `origin: true` reflected the caller's Origin with credentials, which
// is the standard "any site can make authenticated requests" footgun.
const DEFAULT_ORIGINS = [
  'http://localhost:5173',         // Vite dev server
  'http://127.0.0.1:5173',
  'http://158.180.63.20',          // production (bare IP, pre-TLS)
  'https://158.180.63.20',         // production (post-TLS)
];
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

app.use(cors({
  origin: (origin, cb) => {
    // Same-origin requests + healthchecks + curl-without-Origin have no
    // Origin header — let them through. Browser-initiated cross-origin
    // requests always set Origin, so this only opens up tools, not pages.
    if (!origin) return cb(null, true);
    if (ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-anthropic-key', 'x-openai-key'],
  credentials: true,
}));
console.log(`[cors] allowed origins: ${ORIGINS.join(', ')}`);

// verify captures raw body for webhook HMAC verification
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString(); }, limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── Rate-limit gates (mounted BEFORE the route handlers they protect) ───────
// loginLimiter is path-specific so /me + /invite preview aren't throttled.
app.use('/api/auth/login',    loginLimiter);
app.use('/api/auth/register', registerLimiter);
// /api/ai/* funnels every model call (text + image stages) — single AI
// limiter is enough; image routes get the extra imageLimiter on top.
app.use('/api/ai',            aiLimiter);
// Map image generation surfaces (uploads + DALL-E persistence + sketch jobs).
app.use('/api/maps/:id/image',           imageLimiter);
app.use('/api/maps/:id/image/from-url',  imageLimiter);
app.use('/api/maps/generate-from-sketch', imageLimiter);

// ── API routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',            authRouter);
app.use('/api/campaigns',       campaignRouter);
app.use('/api/characters',      characterRouter);
app.use('/api/npcs',            npcRouter);
app.use('/api/spells',          spellRouter);
app.use('/api/quests',          questRouter);
app.use('/api/encounters',      encounterRouter);
app.use('/api/loot',            lootRouter);
app.use('/api/magical-items',   magicalItemsRouter);
app.use('/api/monsters',        monstersRouter);
app.use('/api/maps',            mapRouter);
app.use('/api/map-connectors',  mapConnectorsRouter);
app.use('/api/party-knowledge', partyKnowledgeRouter);
app.use('/api/party-hub',       partyHubRouter);
app.use('/api/party-inventory',  partyInventoryRouter);
app.use('/api/saved-encounters', savedEncountersRouter);
app.use('/api/ai',               aiRouter);
app.use('/api/party-equipment',      partyEquipmentRouter);
app.use('/api/character-equipment',  characterEquipmentRouter);
app.use('/api/character-spells',     characterSpellsRouter);
app.use('/api/weapons-catalog',      weaponsCatalogRouter);
app.use('/api/armor-catalog',        armorCatalogRouter);
app.use('/api/webhook',              webhookRouter);
app.use('/api/proficiencies',        proficienciesRouter);
app.use('/api/kits',                 kitsRouter);
app.use('/api/admin',                adminRouter);

// ── Serve React frontend (production build) ────────────────────────────────────
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC));
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC, 'index.html'), err => {
    if (err) res.status(503).send('App is deploying — please refresh in a moment.');
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
autoMigrate().then(() => {
  app.listen(PORT, () => {
    console.log(`AD&D Manager running on http://localhost:${PORT}`);
  });
});
