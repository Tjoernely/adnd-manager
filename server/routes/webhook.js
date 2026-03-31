/**
 * server/routes/webhook.js — v4
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

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { shell: '/bin/bash', env: process.env }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

router.post('/deploy', async (req, res) => {
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

  try {
    console.log('[deploy] git pull...');
    await run('cd ' + APP + ' && git fetch origin && git reset --hard origin/main');
    console.log('[deploy] npm ci root...');
    await run('npm --prefix ' + APP + ' ci');
    console.log('[deploy] npm ci server...');
    await run('npm --prefix ' + APP + '/server ci');
    console.log('[deploy] build...');
    await run('npm run --prefix ' + APP + ' build');
    console.log('[deploy] pm2 restart...');
    await run('pm2 restart adnd-backend && pm2 save');
    console.log('[deploy] DONE');
  } catch(e) {
    console.error('[deploy] FAILED at step:', e.message.substring(0, 1000));
  }
});

module.exports = router;
