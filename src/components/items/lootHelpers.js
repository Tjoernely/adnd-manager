// Shared helpers for sending a magical item to Party Loot.
// Used by MagicalItemLibrary (Library tab) and DrillDown (Drill-Down Tables tab).

export function mapCategory(category, name) {
  const c = (category || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (c === 'weapon' || n.includes('sword') || n.includes('axe') ||
      n.includes('bow') || n.includes('dagger') || n.includes('spear') ||
      n.includes('mace') || n.includes('hammer') || n.includes('staff') ||
      n.includes('wand')) return 'weapon';
  if (c === 'armor' || n.includes('armor') || n.includes('mail') ||
      n.includes('shield') || n.includes('plate') || n.includes('leather'))
    return (c.includes('shield') || n.includes('shield')) ? 'shield' : 'armor';
  if (c === 'potion') return 'potion';
  if (c === 'scroll') return 'scroll';
  if (c === 'ring')   return 'ring';
  if (c === 'wand')   return 'wand';
  if (c === 'rod' || c === 'staff') return 'staff';
  return 'misc';
}

export function buildItemNotes(item) {
  const desc = ((item.description_preview || item.description) || '').toLowerCase();
  const weaponTypes = [
    'short sword', 'long sword', 'broad sword', 'two-handed sword',
    'bastard sword', 'dagger', 'battle axe', 'hand axe', 'war hammer',
    'mace', 'flail', 'spear', 'quarterstaff', 'bow', 'crossbow', 'sling',
    'scimitar', 'rapier', 'katana',
  ];
  const foundType  = weaponTypes.find(t => desc.includes(t));
  const bonusMatch = desc.match(/\+(\d+)\s*(to hit|hit|sword|weapon|attack|damage)?/i);
  const bonus      = bonusMatch ? `+${bonusMatch[1]}` : null;
  return [
    foundType ? `Type: ${foundType}` : null,
    bonus     ? `Bonus: ${bonus}`    : null,
    item.xp_value ? `XP: ${item.xp_value}` : null,
  ].filter(Boolean).join(' | ');
}

/**
 * Build a POST body for /party-equipment from a magical_items row.
 * Works with both list-endpoint results (description_preview) and single-item
 * results (full description).
 */
export function buildLootPayload(item, campaignId) {
  const full = item.description || item.description_preview || '';
  return {
    campaign_id:     campaignId,
    name:            item.name,
    description:     full.substring(0, 1200),
    is_magical:      true,
    identify_state:  'unknown',
    item_type:       mapCategory(item.category, item.name),
    magical_item_id: item.id ?? null,
    value_gp:        item.value_gp ?? null,
    source:          'found',
    notes:           buildItemNotes(item),
  };
}
