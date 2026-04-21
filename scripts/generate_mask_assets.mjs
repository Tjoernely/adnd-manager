/**
 * generate_mask_assets.mjs
 *
 * One-shot script to generate the 5 alpha-edge masks used by the tile
 * compositor. Produces 1024x1024 PNGs from gpt-image-1 under
 * server/assets/tiles/masks/ ; afterwards `pnpm run masks:postprocess`
 * (or ImageMagick by hand) can downscale/clean them to 256x256.
 *
 * Usage (from repo root):
 *   OPENAI_API_KEY=sk-... node scripts/generate_mask_assets.mjs
 *
 * The masks are not wired into the render pipeline yet — they are groundwork
 * for the next step of the plan (soft terrain transitions via
 * EdgeMaskLibrary + BitmaskCalculator).
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('Set OPENAI_API_KEY in the environment before running this script.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const OUT_DIR    = path.resolve(__dirname, '..', 'server', 'assets', 'tiles', 'masks');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MASTER_CONTEXT = `
Technical rules — ZERO tolerance:
- Output: pure grayscale only, absolutely no color.
- Black pixels (#000000) = fully opaque (the tile above shows through).
- White pixels (#FFFFFF) = fully transparent (the tile below shows through).
- Gradient transition should feather smoothly over roughly 120-240 pixels (scale to 1024x1024).
- The boundary between black and white must be ORGANIC, not a straight line or clean geometric gradient. Hand-painted watercolor edge with slight irregular variation, small bumps, feathered wisps — like the edge of a forest fading into a meadow in a Mike Schley fantasy map.
- No text, no borders, no labels, no compass, no frame. Pure mask only.
- Subtle irregular boundary, not noisy or chaotic. Softly brushed ink.
- Background outside the black region must be PURE WHITE (#FFFFFF), so it maps cleanly to 0% alpha.
`.trim();

const MASKS = [
  { name: 'mask_edge',     shape: `The SOUTH half of the image is pure black. The NORTH edge (top) fades to pure white over the top ~240 pixels with an organic painterly boundary. The east, west, and south edges of the image are pure black (touch the frame). Only the top fades out.` },
  { name: 'mask_corner',   shape: `The SOUTHWEST region of the image (lower-left quadrant) is pure black. The image fades to pure white toward the NORTHEAST corner. The west and south edges touch pure black; the north and east edges touch pure white. The diagonal transition should be a soft, irregular, painterly curve — not a clean 45 degree line.` },
  { name: 'mask_opposite', shape: `A horizontal black band runs across the middle of the image. The top ~240 pixels and the bottom ~240 pixels both fade to pure white. The left and right edges of the center band touch pure black. Both fade boundaries (top and bottom) should be organic, soft, painterly — independent irregular wavy lines.` },
  { name: 'mask_three',    shape: `Only the SOUTH edge (bottom ~240 pixels) stays pure black and fades upward and to the sides into white. The north, east, and west edges of the image are pure white. The black region is a rounded blob hugging the bottom edge, fading organically into white on three sides.` },
  { name: 'mask_isolated', shape: `A rounded black blob in the CENTER of the image, occupying roughly the middle 55% of the area, fading organically to pure white on all four sides. All four edges of the image are pure white. The blob edge should be soft, irregular, painterly — like a watercolor puddle.` },
];

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const u    = new URL(url);
    const req  = https.request({
      hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
      headers: {
        'Authorization':  `Bearer ${API_KEY}`,
        'Content-Type':   'application/json',
        'Content-Length': data.length,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 600)}`));
        else                        resolve(JSON.parse(body));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function generateMask({ name, shape }) {
  const prompt = `${MASTER_CONTEXT}\n\nGenerate ${name}: ${shape}`;
  const t0 = Date.now();
  console.log(`[${name}] requesting 1024x1024 from gpt-image-1...`);
  const resp = await postJson('https://api.openai.com/v1/images/generations', {
    model: 'gpt-image-1',
    prompt,
    size:  '1024x1024',
    n:     1,
  });
  const b64 = resp && resp.data && resp.data[0] && resp.data[0].b64_json;
  if (!b64) throw new Error(`[${name}] no b64 in response: ${JSON.stringify(resp).slice(0, 400)}`);
  const buf = Buffer.from(b64, 'base64');
  const outPath = path.join(OUT_DIR, `${name}_1024.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`[${name}] saved ${buf.length} bytes in ${Date.now() - t0} ms -> ${outPath}`);
  return outPath;
}

const results = await Promise.all(MASKS.map(generateMask));
console.log('\nAll 5 masks generated:');
results.forEach(p => console.log('  ' + p));
console.log('\nNext step: downscale + clean to 256x256 with ImageMagick, e.g.:');
console.log('  magick mask_edge_1024.png -resize 256x256 -colorspace Gray -normalize mask_edge.png');
