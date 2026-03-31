/**
 * server/routes/webhook.js
 * POST /api/webhook/deploy  — GitHub push event -> korer deploy.sh
 *
 * Ops setup:
 *   1. Tilfoej WEBHOOK_SECRET til server/.env
 *   2. GitHub: Settings -> Webhooks -> Add webhook
 *      Payload URL : http://<din-server>/api/webhook/deploy
 *      Content type: application/json
 *      Secret      : <WEBHOOK_SECRET>
 *      Events      : Just the push event
 */
const express  = require('express');
const crypto   = require('crypto');
const { exec } = require('child_process');
const path     = require('path');
const router   = express.Router();

const DEPLOY_SCRIPT = path.resolve(__dirname, '../../deploy.sh');

function verifySignature(req) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) { console.warn('[webhook] WEBHOOK_SECRET not set — rejecting'); return false; }
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(req.rawBody || '').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
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
  const env = Object.assign({}, process.env, {
    PATH: process.env.PATH + ':/usr/local/bin:/usr/bin:/bin' +
          ':/var/www/adnd-manager/node_modules/.bin'
  });
  const child = exec('bash ' + DEPLOY_SCRIPT, { env },
    (err, stdout, stderr) => {
      if (err) console.error('[webhook] deploy.sh error:', err.message, stderr?.substring(0,200));
      else console.log('[webhook] deploy.sh completed');
    });
  child.unref();
});

module.exports = router;
