/**
 * Fire-and-forget signup notification.
 *
 * Sends a Discord webhook ONLY if DISCORD_WEBHOOK_URL is configured; otherwise
 * it is a silent no-op (the feature is dormant until the owner sets the key, or
 * swaps in an email provider later). Every error — missing key, network, bad
 * URL, non-2xx — is swallowed: a notification failure must NEVER break
 * registration. The caller does not await this.
 */
async function notifyNewSignup({ username, email } = {}) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return; // inactive until configured
  try {
    const content = `New RealmKeep signup: ${username} (${email}) — pending approval`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) console.warn('[notify/signup] webhook returned HTTP', res.status);
  } catch (e) {
    console.warn('[notify/signup] webhook failed:', e.message);
  }
}

module.exports = { notifyNewSignup };
