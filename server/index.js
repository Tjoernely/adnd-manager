require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const path     = require('path');

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
const webhookRouter         = require('./routes/webhook');
const proficienciesRouter     = require('./routes/proficiencies');
const kitsRouter              = require('./routes/kits');

const app  = express();
const PORT = process.env.PORT || 3000;

// ââ Middleware âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Explicitly allow Authorization header so JWT tokens pass through all routes
app.use(cors({
  origin: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString(); }, limit: '5mb' }));   // 5 MB â covers portrait URLs + large character state

// ââ API routes âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
app.use('/api/webhook',               webhookRouter);
app.use('/api/proficiencies',          proficienciesRouter);
app.use('/api/kits',                   kitsRouter);

// ââ Serve React frontend (production build) ââââââââââââââââââââââââââââââââââââ
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

// ââ Start ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
autoMigrate().then(() => {
  app.listen(PORT, () => {
    console.log(`AD&D Manager running on http://localhost:${PORT}`);
  });
});
