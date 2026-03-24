/**
 * import-dragon-variants.mjs
 *
 * Canonical entry-point for importing dragon age-category variants.
 * All parsing and DB logic lives in import-variants.mjs.
 *
 * Usage:
 *   node scripts/import-dragon-variants.mjs
 *   node scripts/import-dragon-variants.mjs --dry-run
 *   node scripts/import-dragon-variants.mjs --limit 5
 *   node scripts/import-dragon-variants.mjs --name "Dragon, Red"
 *
 * Env vars: DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD
 */

import './import-variants.mjs';
