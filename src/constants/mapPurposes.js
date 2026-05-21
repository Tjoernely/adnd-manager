/**
 * Sub-map purposes — bias the AI generation toward a specific content scope.
 *
 * Used by:
 *   - MapGenerator's Sub-Map modal (purpose dropdown, only shown for sub-maps)
 *   - resolveParams → buildMetadataPrompt / buildPoisPrompt (prompt guidance)
 *   - MapTreeNode (data-purpose attribute → CSS styling for decoy maps)
 *   - server/routes/maps.js (purpose column on the maps table)
 *
 * Decoy is the "DM forgot to plan this room" feature the user originally asked
 * for — looks real, has no plot.
 */

export const MAP_PURPOSES = [
  {
    value:       'standard',
    label:       'Standard',
    description: 'Default mix. 3-6 POIs, balanced loot, possible background lore.',
  },
  {
    value:       'minor',
    label:       'Minor',
    description: '1-3 POIs, light flavor only. Modest loot. Optional minor NPC.',
  },
  {
    value:       'decoy',
    label:       'Decoy',
    description: '1-3 mundane POIs. Trivial loot only. No quest hooks or major NPCs. Looks plausible to the party.',
  },
  {
    value:       'major',
    label:       'Major',
    description: '5-8 POIs with key NPCs and quest hooks. Plot-critical, rich content.',
  },
];

export const PURPOSE_BY_VALUE = Object.fromEntries(MAP_PURPOSES.map(p => [p.value, p]));
