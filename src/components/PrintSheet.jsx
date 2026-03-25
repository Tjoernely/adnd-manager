/**
 * PrintSheet.jsx — AD&D 2E S&P Print-Friendly Character Sheet
 *
 * Wrapper component: full-screen overlay + Print/Close toolbar.
 * All sheet rendering is delegated to CharacterPrintView.
 *
 * Usage (in App.jsx):
 *   <PrintSheet
 *     characterData={char.serializeCharacter()}
 *     isOpen={showPrint}
 *     onClose={() => setShowPrint(false)}
 *   />
 *
 * Screen: fixed full-screen overlay when isOpen=true.
 * Print:  @media print in PrintSheet.css hides everything else and shows this.
 */

import { CharacterPrintView } from './characters/CharacterPrintView.jsx';
import './PrintSheet.css';

export function PrintSheet({ isOpen, onClose, characterData, characterId }) {
  return (
    <>
      {/* Screen overlay backdrop */}
      {isOpen && <div className="ps-overlay" onClick={onClose} />}

      {/* Sheet container */}
      <div className={`ps-wrapper${isOpen ? '' : ' ps-wrapper--hidden'}`} id="print-sheet">

        {/* Screen-only toolbar */}
        <div className="ps-toolbar no-print">
          <button className="ps-btn ps-btn--print" onClick={() => window.print()}>
            🖨 Print
          </button>
          <button className="ps-btn ps-btn--close" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <CharacterPrintView characterData={characterData} characterId={characterId} />
      </div>
    </>
  );
}
