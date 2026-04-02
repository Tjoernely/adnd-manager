/**
 * src/rules-engine/scopeValidator.ts
 *
 * Pure functions for scope hierarchy and POI/location validation.
 * No side effects, no React, no browser APIs.
 */

import type {
  MapScope,
  ScopeRule,
  LocationExtended,
  TagRule,
  ValidationResult,
} from './mapTypes';
import { validateTags, applyTagRules } from './tagEngine';

// ── getAllowedChildScopes ─────────────────────────────────────────────────────

export function getAllowedChildScopes(
  scope: MapScope,
  scopeRules: ScopeRule[],
): MapScope[] {
  const rule = scopeRules.find(r => r.scope === scope);
  return rule?.allowed_child_scopes ?? [];
}

// ── validatePOI ───────────────────────────────────────────────────────────────

export function validatePOI(
  poiType: string,
  parentScope: MapScope,
  scopeRules: ScopeRule[],
): ValidationResult {
  const rule = scopeRules.find(r => r.scope === parentScope);
  if (!rule) {
    return { valid: false, errors: [`Unknown scope: "${parentScope}"`] };
  }

  const errors: string[] = [];

  if (rule.forbidden_poi_types.includes(poiType)) {
    errors.push(
      `POI type "${poiType}" is forbidden in scope "${parentScope}"`,
    );
  }

  if (
    rule.allowed_poi_types.length > 0 &&
    !rule.allowed_poi_types.includes(poiType)
  ) {
    errors.push(
      `POI type "${poiType}" is not in the allowed list for scope "${parentScope}"`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ── validateLocation ──────────────────────────────────────────────────────────

export function validateLocation(
  location: LocationExtended,
  scopeRules: ScopeRule[],
  tagRules: TagRule[],
): ValidationResult {
  const scopeRule = scopeRules.find(r => r.scope === location.scope);
  if (!scopeRule) {
    return { valid: false, errors: [`Unknown scope: "${location.scope}"`] };
  }

  const errors: string[] = [];

  // Apply tag propagation rules before validating
  const resolvedTags = applyTagRules(location.tags, tagRules);

  // Validate tags against scope restrictions
  const tagResult = validateTags(resolvedTags, scopeRule);
  errors.push(...tagResult.errors);

  // Validate context terrain is not empty
  if (!location.context.terrain || location.context.terrain === '') {
    errors.push('Location context.terrain must not be empty');
  }

  return { valid: errors.length === 0, errors };
}
