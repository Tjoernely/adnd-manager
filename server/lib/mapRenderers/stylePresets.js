/**
 * Map style presets for the sketch-renderer flow.
 *
 * Canonical preset data (slug → label / description / promptAddition) lives in
 * src/rulesets/mapStylePresets.json so the backend (this file) and the frontend
 * (MapGenerator.jsx, TerrainSketchEditor.jsx) read from the same source. The
 * prompt strings are IP-clean — no artist names, no published-setting names —
 * because they are sent to third-party image APIs.
 */

const presetsJson = require('../../../src/rulesets/mapStylePresets.json');

// COLOR_GUIDE is sketch-flow specific — it tells the renderer how to read the
// colour-coded zones of the control image. The typed-map flow (no control
// image) does NOT use this prefix; it uses promptAddition alone.
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

const STYLE_PRESETS = Object.fromEntries(
  Object.entries(presetsJson)
    .filter(([key]) => !key.startsWith('$'))
    .map(([slug, p]) => [
      slug,
      {
        label:  p.label,
        prompt: COLOR_GUIDE + p.promptAddition,
      },
    ]),
);

function getPrompt(stylePreset, userPrompt) {
  const style = STYLE_PRESETS[stylePreset] ?? STYLE_PRESETS.schley;
  return style.prompt + (userPrompt ? ` Additional context: ${userPrompt}` : '');
}

module.exports = { STYLE_PRESETS, getPrompt };
