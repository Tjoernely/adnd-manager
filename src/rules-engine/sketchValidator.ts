/**
 * src/rules-engine/sketchValidator.ts
 *
 * Validates a SketchSpec before it enters the generation pipeline.
 * Pure logic — no side-effects.
 */

import type {
  SketchSpec,
  SketchCell,
  SketchOverlay,
  SketchModifier,
  ValidationResult,
} from './mapTypes';

const VALID_BIOMES    = new Set(['plains','forest','swamp','desert','tundra','volcanic','ocean','coastal','mountains','lake']);
const VALID_RELIEFS   = new Set(['flat','rolling','hills','mountainous','cliffs','valley','plateau']);
const VALID_OVERLAYS  = new Set(['river','road','wall','border','canyon','chasm']);
const VALID_MODIFIERS = new Set(['cursed','sacred','magical','blighted','fertile','ancient_ruins','enchanted','corrupted','divine']);
const VALID_SCOPES    = new Set(['world','region','local']);
const VALID_FREEDOM   = new Set(['strict','balanced','creative']);
const VALID_CLIMATES  = new Set(['temperate','tropical','arctic','arid']);
const VALID_SCALES    = new Set(['10mi','50mi','200mi','500mi']);

function inRange(v: number, min: number, max: number) {
  return Number.isInteger(v) && v >= min && v <= max;
}

function validateCell(c: SketchCell, i: number): string[] {
  const errs: string[] = [];
  if (!inRange(c.x, 0, 31)) errs.push(`cells[${i}].x out of range (${c.x})`);
  if (!inRange(c.y, 0, 31)) errs.push(`cells[${i}].y out of range (${c.y})`);
  if (!VALID_BIOMES.has(c.biome)) errs.push(`cells[${i}].biome invalid: "${c.biome}"`);
  if (c.relief !== undefined && !VALID_RELIEFS.has(c.relief))
    errs.push(`cells[${i}].relief invalid: "${c.relief}"`);
  return errs;
}

function validateOverlay(o: SketchOverlay, i: number): string[] {
  const errs: string[] = [];
  if (!VALID_OVERLAYS.has(o.type)) errs.push(`overlays[${i}].type invalid: "${o.type}"`);
  if (!Array.isArray(o.points) || o.points.length < 2)
    errs.push(`overlays[${i}] must have at least 2 points`);
  o.points?.forEach((p, pi) => {
    if (!inRange(p.x, 0, 31) || !inRange(p.y, 0, 31))
      errs.push(`overlays[${i}].points[${pi}] out of range`);
  });
  return errs;
}

function validateModifier(m: SketchModifier, i: number): string[] {
  const errs: string[] = [];
  if (!VALID_MODIFIERS.has(m.type)) errs.push(`modifiers[${i}].type invalid: "${m.type}"`);
  if (!inRange(m.x, 0, 31)) errs.push(`modifiers[${i}].x out of range`);
  if (!inRange(m.y, 0, 31)) errs.push(`modifiers[${i}].y out of range`);
  if (typeof m.r !== 'number' || m.r < 1 || m.r > 16)
    errs.push(`modifiers[${i}].r must be 1–16`);
  return errs;
}

export function validateSketchSpec(spec: SketchSpec): ValidationResult {
  const errors: string[] = [];

  if (spec.grid_size !== 32) errors.push('grid_size must be 32');
  if (!VALID_SCOPES.has(spec.scope)) errors.push(`scope invalid: "${spec.scope}"`);
  if (!VALID_FREEDOM.has(spec.ai_freedom)) errors.push(`ai_freedom invalid: "${spec.ai_freedom}"`);
  if (typeof spec.lore_mode !== 'boolean') errors.push('lore_mode must be boolean');

  if (spec.climate !== undefined && !VALID_CLIMATES.has(spec.climate))
    errors.push(`climate invalid: "${spec.climate}"`);
  if (spec.scale !== undefined && !VALID_SCALES.has(spec.scale))
    errors.push(`scale invalid: "${spec.scale}"`);

  if (!Array.isArray(spec.cells) || spec.cells.length === 0)
    errors.push('cells must be a non-empty array');
  else
    spec.cells.forEach((c, i) => errors.push(...validateCell(c, i)));

  // Duplicate cell check
  const seen = new Set<string>();
  spec.cells?.forEach((c, i) => {
    const key = `${c.x},${c.y}`;
    if (seen.has(key)) errors.push(`cells[${i}] duplicates position (${c.x},${c.y})`);
    seen.add(key);
  });

  // Skip overlays with fewer than 2 points — they are incomplete strokes, not errors
  (spec.overlays ?? []).filter(o => o.points?.length >= 2).forEach((o, i) => errors.push(...validateOverlay(o, i)));
  (spec.modifiers ?? []).forEach((m, i) => errors.push(...validateModifier(m, i)));

  if (spec.user_prompt !== undefined && spec.user_prompt.length > 500)
    errors.push('user_prompt must be ≤500 characters');

  return { valid: errors.length === 0, errors };
}
