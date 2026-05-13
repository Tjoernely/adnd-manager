/**
 * Optional route: GET /api/monster-tags
 *
 * Returns the controlled tag vocabulary so the frontend can build filter UI
 * dynamically (drill-down menus, tag chips with descriptions, etc.) without
 * hardcoding the list.
 *
 * Returns:
 * {
 *   primary:  [{slug, label, description}, ...],
 *   subtype:  [{slug, label}, ...],
 *   modifier: [{slug, label, description}, ...]
 * }
 *
 * Add this alongside the existing /api/monsters routes.
 */

const fs = require('fs');
const path = require('path');

let cachedVocab = null;
function loadVocab() {
  if (cachedVocab) return cachedVocab;
  const vocabPath = path.join(__dirname, '..', 'data', 'tag-vocabulary.json');
  cachedVocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
  return cachedVocab;
}

// In your existing routes file, add:

router.get('/monster-tags', (req, res) => {
  const vocab = loadVocab();
  res.json({
    primary: vocab.primary,
    subtype: vocab.subtype,
    modifier: vocab.modifier,
    version: vocab.version,
  });
});

// Optional: a histogram endpoint showing how many monsters have each tag.
// Useful so the filter UI can grey out tags that have 0 matching monsters.
router.get('/monster-tags/histogram', async (req, res) => {
  try {
    // PostgreSQL: use jsonb_array_elements_text to flatten and count
    const result = await db.query(`
      SELECT tag, COUNT(*) AS count
        FROM monsters,
             LATERAL jsonb_array_elements_text(tags) AS tag
       WHERE tags IS NOT NULL
       GROUP BY tag
       ORDER BY count DESC
    `);
    const histogram = {};
    for (const row of result.rows) {
      histogram[row.tag] = parseInt(row.count, 10);
    }
    res.json(histogram);
  } catch (e) {
    console.error('histogram failed', e);
    res.status(500).json({ error: 'Failed to compute histogram' });
  }
});
