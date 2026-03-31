/**
 * server/routes/webhook.js
 * POST /api/webhook/deploy  — GitHub push event -> auto deploy
 */
const express  = require('express');
const crypto   = require('crypto');
const { exec } = require('child_process');
const router   = express.Router();

const APP = '/var/www/adnd-manager';

function verifySignature(req) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) { console.warn('[webhook] WEBHOOK_SECRET not set'); return false; }
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
  console.log('[webhook] Push to main — deploying...');
  res.status(202).json({ message: 'Deploy queued' });

  // Run all deploy steps inline — avoids bash re-reading a cached script file
  const steps = [
    'cd ' + APP + ' && git fetch origin && git reset --hard origin/main',
    'npm --prefix ' + APP + ' ci --silent',
    'npm --prefix ' + APP + '/server ci --silent',
    'npm run --prefix ' + APP + ' build',
    'pm2 restart adnd-backend',
    'pm2 save'
  ].join(' && ');

  exec(steps, { env: process.env, shell: '/bin/bash' }, (err, _out, stderr) => {
    if (err) {
      console.error('[webhook] deploy error:', err.message);
      if (stderr) console.error('[webhook] stderr:', stderr.substring(0, 500));
    } else {
      console.log('[webhook] Deploy complete');
    }
  });
});

module.exports = router;
