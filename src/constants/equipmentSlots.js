/**
 * AD&D 2E equipment slot constants.
 */

export const SLOTS = {
  HEAD:       'head',
  NECK:       'neck',
  SHOULDERS:  'shoulders',
  BODY:       'body',
  CLOAK:      'cloak',
  BELT:       'belt',
  WRISTS:     'wrists',
  RING_L:     'ring_l',
  RING_R:     'ring_r',
  GLOVES:     'gloves',
  BOOTS:      'boots',
  HAND_R:     'hand_r',
  HAND_L:     'hand_l',
  RANGED:     'ranged',
  AMMO:       'ammo',
};

export const SLOT_LABELS = {
  head:       'Head',
  neck:       'Neck',
  shoulders:  'Shoulders',
  body:       'Body',
  cloak:      'Cloak',
  belt:       'Belt',
  wrists:     'Wrists',
  ring_l:     'Ring (L)',
  ring_r:     'Ring (R)',
  gloves:     'Gloves',
  boots:      'Boots',
  hand_r:     'Main Hand',
  hand_l:     'Off Hand',
  ranged:     'Ranged',
  ammo:       'Ammo',
};

/** Slots where equipping a 2H weapon occupies both */
export const TWO_HANDED_SLOTS = ['hand_r', 'hand_l'];

/** All valid slot values */
export const VALID_SLOTS = Object.values(SLOTS);
