/**
 * server/routes/webhook.js
 */
const express  = require('express');
const crypto   = require('crypto');
const { exec } = require('child_process');
const router   = express.Router();
const APP      = '/var/www/adnd-manager';

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
  console.log('[webhook] Push to main detected');
  res.status(202).json({ message: 'Deploy queued' });

  // Build first — WITHOUT pm2 restart (that kills this process)
  const buildCmd = [
    'cd ' + APP,
    'git fetch origin',
    'git reset --hard origin/main',
    'npm --prefix ' + APP + ' ci',
    'npm --prefix ' + APP + '/server ci',
    'npm run --prefix ' + APP + ' build'
  ].join(' && ');

  exec(buildCmd, { shell: '/bin/bash', env: process.env }, (err, _out, stderr) => {
    if (err) {
      console.error('[webhook] Build failed:', (stderr || err.message).substring(0, 500));
      return;
    }
    console.log('[webhook] Build complete — restarting in 1s...');
    // Delay restart so this callback can finish before process is killed
    setTimeout(() => {
      exec('pm2 restart adnd-backend && pm2 save', { shell: '/bin/bash' }, () => {});
    }, 1000);
  });
});

module.exports = router;
