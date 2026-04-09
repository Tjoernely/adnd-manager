const COLOR_GUIDE =
  'This is a color-coded terrain map. ' +
  'Green zones = forest/vegetation. ' +
  'Blue zones = ocean/deep water. ' +
  'Teal zones = coastal/shallow water. ' +
  'Light green = plains/grassland. ' +
  'Sandy/tan zones = desert. ' +
  'Dark olive = swamp/marsh. ' +
  'Light blue-grey = tundra/ice. ' +
  'Dark red-brown = volcanic terrain. ' +
  'Grey-brown darker zones = hills or mountains. ' +
  'Blue lines = rivers. Brown/tan lines = roads. ' +
  'Dark brown/black lines = canyons or chasms. ';

const STYLE_PRESETS = {
  schley: {
    label:  '🏔 Modern Classical Fantasy',
    prompt: COLOR_GUIDE + 'Transform this into a high-quality illustrated fantasy map in the style of modern professional D&D cartography (Mike Schley / Forgotten Realms style). Hand-painted terrain icons — illustrated mountain ranges, clusters of detailed tree symbols for forests, stylized coastlines and rivers. Rich earthy colors, cream or light parchment background, professional RPG atlas quality. Preserve the EXACT terrain layout and zone positions. No text labels. No grid lines.',
  },
  handwritten: {
    label:  '✏️ Crude Handwritten',
    prompt: COLOR_GUIDE + 'Transform this into a rough hand-drawn map as if sketched quickly by an adventurer or non-cartographer. Wobbly imprecise lines, uneven hatching for terrain, crude simple symbols (scrawled triangles for mountains, messy blobs for forests, wavy lines for water). Pencil or ballpoint pen on plain paper look. Imperfect, slightly crooked, charmingly amateurish. Preserve the EXACT terrain layout and zone positions. No text labels.',
  },
  parchment: {
    label:  '📜 Parchment Atlas',
    prompt: COLOR_GUIDE + 'Transform this into a top-down fantasy map illustration on aged parchment paper. Hand-drawn ink style, Tolkien/Forgotten Realms atlas aesthetic. Preserve the EXACT terrain layout and zone positions. No text labels. No grid lines.',
  },
  ink: {
    label:  '🖋 Hand-drawn Ink',
    prompt: COLOR_GUIDE + 'Transform this into a hand-drawn ink map on cream paper. Artistic pen strokes, minimal color. Preserve the EXACT terrain layout and zone positions. No text labels.',
  },
  classic: {
    label:  '🗺 Classic D&D Module',
    prompt: COLOR_GUIDE + 'Transform this into a classic D&D module map. Simple top-down symbols, black ink on light background, iconic RPG cartography style. Preserve the EXACT terrain layout and zone positions. No text labels.',
  },
};

function getPrompt(stylePreset, userPrompt) {
  const style = STYLE_PRESETS[stylePreset] ?? STYLE_PRESETS.schley;
  return style.prompt + (userPrompt ? ` Additional context: ${userPrompt}` : '');
}

module.exports = { STYLE_PRESETS, getPrompt };
