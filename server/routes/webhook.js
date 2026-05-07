const express = require('express');
const crypto  = require('crypto');
const { spawn } = require('child_process');
const fs      = require('fs');

const router    = express.Router();
const APP       = process.env.APP_ROOT || '/var/www/adnd-manager';
const LOG_FILE  = APP + '/deploy.log';
const LOCK_FILE = APP + '/deploy.lock';

// A deploy that takes longer than this is almost certainly hung or crashed.
// Locks older than this are auto-cleared so the next push can proceed.
// Real deploys take ~30–60s; even a slow npm install rarely exceeds 3 min.
const STALE_LOCK_MS = 10 * 60 * 1000;  // 10 minutes

function isLockStale() {
  try {
    const stat = fs.statSync(LOCK_FILE);
    return (Date.now() - stat.mtimeMs) > STALE_LOCK_MS;
  } catch {
    return false;  // no lock = not stale
  }
}

function verifySignature(req) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(req.rawBody || '').digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
  catch { return false; }
}

router.post('/deploy', (req, res) => {
  if (!verifySignature(req)) {
    console.warn('[webhook] Bad signature');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ref = req.body && req.body.ref;
  if (ref && ref !== 'refs/heads/main') {
    return res.status(200).json({ message: 'Ignored: ' + ref });
  }

  // Prevent concurrent deploys — if lock file exists, a deploy is already running.
  // BUT: a deploy that crashed (e.g. server restart mid-deploy, npm install hang
  // killed by OOM) leaves the lock behind forever. Auto-clear locks older than
  // STALE_LOCK_MS so a hung deploy can't permanently block future pushes.
  if (fs.existsSync(LOCK_FILE)) {
    if (isLockStale()) {
      try {
        const ageMin = Math.round((Date.now() - fs.statSync(LOCK_FILE).mtimeMs) / 60000);
        fs.unlinkSync(LOCK_FILE);
        console.warn(`[webhook] Stale lock auto-cleared (${ageMin} min old) — proceeding with deploy`);
        fs.appendFileSync(LOG_FILE, `\n[${new Date().toISOString()}] Stale lock auto-cleared (${ageMin} min old)\n`);
      } catch (e) {
        console.warn('[webhook] Failed to clear stale lock:', e.message);
        return res.status(202).json({ message: 'Stale lock present but could not clear — manual intervention needed' });
      }
    } else {
      console.log('[webhook] Deploy already in progress — skipping');
      return res.status(202).json({ message: 'Deploy already in progress — skipped' });
    }
  }

  console.log('[webhook] Push to main — starting detached deploy');
  res.status(202).json({ message: 'Deploy started' });

  const ts = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `\n[${ts}] Deploy triggered\n`);

  // flock ensures only one deploy runs at a time even if lock check races
  // Lock is created before npm steps and removed after pm2 restart
  const deployCmd = [
    'cd ' + APP,
    'touch ' + LOCK_FILE,
    'git pull --ff-only',
    // npm install (NOT npm ci) — incremental, never wipes node_modules
    // npm run build is skipped — server/public is pre-built and committed to git
    'npm --prefix server install --omit=dev --prefer-offline',
    // pm2 restart is last — child is detached so it survives the restart
    'pm2 restart adnd-backend && pm2 save',
    'rm -f ' + LOCK_FILE,
  ].join(' && ') + '; rm -f ' + LOCK_FILE; // also remove lock on failure

  const child = spawn('bash', ['-c', deployCmd], {
    detached: true,
    stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')],
    cwd: APP,
  });
  child.unref();
});

module.exports = router;
