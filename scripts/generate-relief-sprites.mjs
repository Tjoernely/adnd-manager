/**
 * scripts/generate-relief-sprites.mjs
 *
 * Generates the 5 M4 relief sprites (transparent-background PNGs) with
 * gpt-image-1 — the only project image model that supports true alpha
 * (background: "transparent").
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/generate-relief-sprites.mjs
 * or put OPENAI_API_KEY in server/.env and just run:
 *   node scripts/generate-relief-sprites.mjs
 *
 * Output: public/tiles/sprites/{mountain_large,mountain_small,hill,
 * volcano,volcano_dormant}.png at 1024×1024 (downscale to 512 happens in
 * the verification step / or is fine to ship as-is — the renderer scales).
 * Cost: 5 × gpt-image-1 high ≈ $0.85 total.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let key = process.env.OPENAI_API_KEY;
if (!key) {
  const envPath = path.join(root, 'server', '.env');
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, 'utf8').match(/^OPENAI_API_KEY=(.+)$/m);
    if (m) key = m[1].trim();
  }
}
if (!key) {
  console.error('No OPENAI_API_KEY (env var or server/.env). Aborting.');
  process.exit(1);
}

const STYLE =
  'A single isolated object sprite for a warm painterly fantasy tabletop map ' +
  'tile set, rendered on a FULLY TRANSPARENT background (PNG alpha). ' +
  'Top-down high-angle view, about 60 degrees from above, like a map icon. ' +
  'Hand-painted style with soft painterly texture and flat, even lighting. ' +
  'NO ground plane, NO cast shadow outside the object itself, NO text, ' +
  'NO border, NO background of any kind. Absolutely no outline, no glow, ' +
  'no halo, no rim light, no light edge around the silhouette. The painted ' +
  'pixels must end directly against full transparency. Style must match ' +
  'soft yellow-green hand-painted grassland tiles — NOT pixel art, NOT a ' +
  '3D render, NOT photorealistic. The object: ';

const PROMPTS = {
  mountain_large:
    STYLE + 'one large grey rocky mountain peak with a white snow cap and ' +
    'slight brown tones at the base. Roughly triangular silhouette, organic ' +
    'and craggy, not symmetric.',
  mountain_small:
    STYLE + 'one small, low grey rocky mountain peak in the same style as a ' +
    'larger companion peak, with only a little snow near the summit, slight ' +
    'brown at the base, organic craggy silhouette.',
  hill:
    STYLE + 'one soft rounded grass-covered hill, warm green-brown colors, ' +
    'gentle dome silhouette with subtle painterly grass texture. No snow, ' +
    'no exposed rock.',
  volcano:
    STYLE + 'one volcano with dark grey-brown craggy slopes and a glowing ' +
    'orange-red crater at the top, with thin lava streaks running partway ' +
    'down the slopes. NO smoke plume, no ash cloud.',
  volcano_dormant:
    STYLE + 'one dormant volcano with dark grey-brown craggy slopes and a ' +
    'dark, cold crater at the top. No glow, no lava, no smoke — just cold rock.',
};

const outDir = path.join(root, 'public', 'tiles', 'sprites');
fs.mkdirSync(outDir, { recursive: true });

// Optional subset: node scripts/generate-relief-sprites.mjs mountain_large volcano
const only = process.argv.slice(2);
const entries = Object.entries(PROMPTS).filter(([n]) => only.length === 0 || only.includes(n));

for (const [name, prompt] of entries) {
  process.stdout.write(`${name} ... `);
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024',
        background: 'transparent',
        output_format: 'png',
        quality: 'high',
        n: 1,
      }),
    });
    const j = await r.json();
    if (!r.ok) { console.log(`FAILED: ${JSON.stringify(j).slice(0, 200)}`); continue; }
    const file = path.join(outDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(j.data[0].b64_json, 'base64'));
    console.log(`ok (${(fs.statSync(file).size / 1024).toFixed(0)} kB)`);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}
console.log(`\nDone → ${outDir}`);
