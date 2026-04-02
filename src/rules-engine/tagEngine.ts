/**
 * src/rules-engine/tagEngine.ts
 *
 * Pure functions for LocationTags manipulation and validation.
 * No side effects, no React, no browser APIs.
 */

import type { LocationTags, TagRule, ScopeRule, ValidationResult } from './mapTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAG_CATEGORIES: (keyof LocationTags)[] = [
  'terrain', 'origin', 'depth', 'environment', 'structure', 'hazards', 'special',
];

// ── emptyTags ─────────────────────────────────────────────────────────────────

export function emptyTags(): LocationTags {
  return {
    terrain:     [],
    origin:      [],
    depth:       [],
    environment: [],
    structure:   [],
    hazards:     [],
    special:     [],
  };
}

// ── inheritTags ───────────────────────────────────────────────────────────────

/**
 * Merge parent tags into child tags — union, no duplicates.
 * Parent values are added only if not already present in child.
 */
export function inheritTags(
  parentTags: LocationTags,
  childOwnTags: LocationTags,
): LocationTags {
  const result = emptyTags();
  for (const cat of TAG_CATEGORIES) {
    const combined = [...childOwnTags[cat]];
    for (const tag of parentTags[cat]) {
      if (!combined.includes(tag)) combined.push(tag);
    }
    (result as Record<string, string[]>)[cat] = combined;
  }
  return result;
}

// ── applyTagRules ─────────────────────────────────────────────────────────────

/**
 * For every active tag in `tags`, look up its TagRule and add any `adds_tags`
 * to the appropriate category. Iterates until stable (handles chained adds).
 * Protects against infinite loops with a max-iteration cap.
 */
export function applyTagRules(tags: LocationTags, rules: TagRule[]): LocationTags {
  // Index rules by tag name for fast lookup
  const ruleByTag = new Map<string, TagRule>();
  for (const r of rules) ruleByTag.set(r.tag, r);

  const result = structuredClone(tags) as LocationTags;
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 20) {
    changed = false;
    iterations++;

    for (const cat of TAG_CATEGORIES) {
      const activeTags = [...(result as Record<string, string[]>)[cat]];
      for (const tag of activeTags) {
        const rule = ruleByTag.get(tag);
        if (!rule) continue;
        for (const addedTag of rule.adds_tags) {
          // Find which category the added tag belongs to
          const targetRule = ruleByTag.get(addedTag);
          if (!targetRule) continue;
          const targetCat = targetRule.category as keyof LocationTags;
          const targetArr = (result as Record<string, string[]>)[targetCat];
          if (!targetArr.includes(addedTag)) {
            targetArr.push(addedTag);
            changed = true;
          }
        }
      }
    }
  }

  return result;
}

// ── validateTags ──────────────────────────────────────────────────────────────

/**
 * Check that none of the tag categories forbidden by the scope rule are
 * populated. Returns { valid, errors }.
 */
export function validateTags(
  tags: LocationTags,
  scopeRule: ScopeRule,
): ValidationResult {
  const errors: string[] = [];

  for (const forbiddenCat of scopeRule.forbidden_tag_categories) {
    const values = (tags as Record<string, string[]>)[forbiddenCat];
    if (values && values.length > 0) {
      errors.push(
        `Scope "${scopeRule.scope}" forbids tag category "${forbiddenCat}" but found: ${values.join(', ')}`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
