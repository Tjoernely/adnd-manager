const express = require('express');
const crypto  = require('crypto');
const { spawn } = require('child_process');
const fs      = require('fs');

const router   = express.Router();
const APP      = process.env.APP_ROOT || '/var/www/adnd-manager';
const LOG_FILE = APP + '/deploy.log';

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

  console.log('[webhook] Push to main — starting detached deploy');
  // Respond immediately before the process gets killed by pm2 restart
  res.status(202).json({ message: 'Deploy started' });

  const deployCmd = [
    'cd ' + APP,
    'git pull --ff-only',
    'npm ci --prefer-offline',
    'npm --prefix server ci --prefer-offline',
    'npm run build',
    // pm2 restart is last — it kills this process, but the child is already detached
    'pm2 restart adnd-backend && pm2 save',
  ].join(' && ');

  const ts = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `\n[${ts}] Deploy triggered\n`);

  // detached: true + unref() → child becomes its own process group and survives
  // pm2 restarting (and thus killing) the parent Express process
  const child = spawn('bash', ['-c', deployCmd], {
    detached: true,
    stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')],
    cwd: APP,
  });
  child.unref();
});

module.exports = router;
