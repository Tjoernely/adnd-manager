const STYLE_PRESETS = {
  parchment: {
    label:  '📜 Parchment Atlas',
    prompt: 'Transform this color-coded terrain map into a top-down fantasy map illustration on aged parchment paper. Hand-drawn ink style, Tolkien/Forgotten Realms atlas aesthetic. Preserve the EXACT terrain layout and zone positions. No text labels. No grid lines.',
  },
  fantasy: {
    label:  '🎨 Fantasy Illustrated',
    prompt: 'Transform this color-coded terrain map into a vibrant full-color fantasy map illustration. Painterly style, professional game art, birds eye orthographic view. Preserve the EXACT terrain layout and zone positions. No text labels.',
  },
  ink: {
    label:  '🖋 Hand-drawn Ink',
    prompt: 'Transform this color-coded terrain map into a hand-drawn ink map on cream paper. Artistic pen strokes, minimal color. Preserve the EXACT terrain layout and zone positions. No text labels.',
  },
  classic: {
    label:  '🗺 Classic D&D',
    prompt: 'Transform this color-coded terrain map into a classic D&D module map. Simple top-down symbols, black ink on light background, iconic RPG cartography style. Preserve the EXACT terrain layout and zone positions. No text labels.',
  },
};

function getPrompt(stylePreset, userPrompt) {
  const style = STYLE_PRESETS[stylePreset] ?? STYLE_PRESETS.parchment;
  return style.prompt + (userPrompt ? ` Additional context: ${userPrompt}` : '');
}

module.exports = { STYLE_PRESETS, getPrompt };
