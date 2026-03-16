import { useState } from 'react';
import './Items.css';

/**
 * DiceRoller — animated dice roll button.
 *
 * Props:
 *   sides    — number of sides (20, 100, 1000, etc.)
 *   label    — override button label (default: "d{sides}")
 *   onRoll   — (result: number) => void
 *   disabled — disable the button
 *   className — extra class names for the wrapper
 */
export default function DiceRoller({ sides = 20, label, onRoll, disabled = false, className = '' }) {
  const [rolling, setRolling] = useState(false);
  const [result, setResult]   = useState(null);
  const [animKey, setAnimKey] = useState(0);

  function handleRoll() {
    if (rolling || disabled) return;
    setRolling(true);
    setResult(null);

    setTimeout(() => {
      const n = Math.floor(Math.random() * sides) + 1;
      // Display: d100 uses "00" for 100, d1000 zero-pads to 3 digits
      let display;
      if (sides === 100)       display = n === 100 ? '00' : String(n).padStart(2, '0');
      else if (sides >= 100)   display = String(n).padStart(3, '0');
      else                     display = String(n);

      setResult(display);
      setAnimKey(k => k + 1);
      setRolling(false);
      onRoll?.(n);
    }, 340);
  }

  return (
    <div className={`dr-wrap${className ? ' ' + className : ''}`}
         style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        className={`mi-dice-btn${rolling ? ' mi-dice-btn--rolling' : ''}`}
        onClick={handleRoll}
        disabled={disabled || rolling}
        title={`Roll ${label ?? 'd' + sides}`}
      >
        <span>{rolling ? '⏳' : '🎲'}</span>
        <span>{label ?? `d${sides}`}</span>
      </button>
      {result != null && (
        <span key={animKey} className="mi-roll-result">{result}</span>
      )}
    </div>
  );
}
