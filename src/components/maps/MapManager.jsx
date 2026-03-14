/**
 * MapManager — full-screen map viewer with pin annotations.
 *
 * Props:
 *   campaignId   string
 *   isDM         bool     — DM can edit; players can only view shared maps/pins
 *   isOpen       bool
 *   onClose      fn()
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client.js';
import './MapManager.css';

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPE_LABELS = {
  dungeon: '🏚 Dungeon', world: '🌍 World', region: '🗾 Region',
  city: '🏙 City', town: '🏘 Town', interior: '🏛 Interior',
  encounter: '⚔ Encounter', other: '📍 Other',
};

const PIN_COLORS = [
  '#e04040', '#e08020', '#d0c020', '#40a040',
  '#4080d0', '#8040c0', '#c040a0', '#808080',
];

const PIN_ICONS = ['📍', '⚔', '💀', '🔒', '👁', '🏰', '🌲', '💎', '❓', '⚠', '🏠', '⛩'];

function newPin(x, y) {
  return {
    id:      `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    x, y,
    label:   'New Location',
    notes:   '',
    shared:  false,
    color:   PIN_COLORS[0],
    icon:    '📍',
    links:   { npcIds: [], encounterIds: [], questIds: [] },
  };
}

// ── MapManager (root) ─────────────────────────────────────────────────────────
export function MapManager({ campaignId, isDM, isOpen, onClose }) {
  const [maps,       setMaps]       = useState([]);
  const [activeId,   setActiveId]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Linked-entity lists (for pin editor)
  const [npcs,       setNpcs]       = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [quests,     setQuests]     = useState([]);

  // UI state
  const [showCreate,  setShowCreate]  = useState(false);
  const [addPinMode,  setAddPinMode]  = useState(false);
  const [activePinId, setActivePinId] = useState(null);
  const [savingPins,  setSavingPins]  = useState(false);

  const activeMap = (Array.isArray(maps) ? maps : []).find(m => m.id === activeId) ?? null;
  const pins      = Array.isArray(activeMap?.data?.pins) ? activeMap.data.pins : [];
  const activePin = pins.find(p => p.id === activePinId) ?? null;

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !campaignId) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.getMaps(campaignId),
      api.getNpcs(campaignId).catch(() => []),
      api.getEncounters(campaignId).catch(() => []),
      api.getQuests(campaignId).catch(() => []),
    ]).then(([ms, ns, es, qs]) => {
      const safeMaps   = Array.isArray(ms) ? ms : [];
      const safeNpcs   = Array.isArray(ns) ? ns : [];
      const safeEncs   = Array.isArray(es) ? es : [];
      const safeQuests = Array.isArray(qs) ? qs : [];
      setMaps(safeMaps);
      setNpcs(safeNpcs);
      setEncounters(safeEncs);
      setQuests(safeQuests);
      if (safeMaps.length && !activeId) setActiveId(safeMaps[0].id);
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, campaignId]);

  // ── Patch helper (keeps maps[] in sync after remote update) ───────────────
  const patchMap = useCallback((updated) => {
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m));
  }, []);

  // ── Save pins ──────────────────────────────────────────────────────────────
  const savePins = useCallback(async (mapId, nextPins) => {
    const map = maps.find(m => m.id === mapId);
    if (!map) return;
    setSavingPins(true);
    try {
      const updated = await api.updateMap(mapId, {
        name: map.name,
        type: map.type,
        image_url: map.image_url,
        data: { ...map.data, pins: nextPins },
      });
      patchMap(updated);
    } catch (e) {
      console.error('[MapManager] savePins', e.message);
    } finally {
      setSavingPins(false);
    }
  }, [maps, patchMap]);

  // ── Map-level visibility toggle ────────────────────────────────────────────
  const toggleVisibility = useCallback(async () => {
    if (!activeMap || !isDM) return;
    const next = !activeMap.data?.visible_to_players;
    const updated = await api.updateMap(activeMap.id, {
      name:      activeMap.name,
      type:      activeMap.type,
      image_url: activeMap.image_url,
      data:      { ...activeMap.data, visible_to_players: next },
    });
    patchMap(updated);
  }, [activeMap, isDM, patchMap]);

  // ── Add pin on map click ───────────────────────────────────────────────────
  const imgWrapRef = useRef(null);

  const handleMapClick = useCallback((e) => {
    if (!addPinMode || !isDM || !activeMap) return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top)  / rect.height;
    const pin = newPin(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
    const nextPins = [...pins, pin];
    savePins(activeMap.id, nextPins);
    setActivePinId(pin.id);
    setAddPinMode(false);
  }, [addPinMode, isDM, activeMap, pins, savePins]);

  // ── Delete current map ─────────────────────────────────────────────────────
  const deleteActiveMap = useCallback(async () => {
    if (!activeMap || !isDM) return;
    if (!window.confirm(`Delete map "${activeMap.name}"? This cannot be undone.`)) return;
    await api.deleteMap(activeMap.id);
    const remaining = maps.filter(m => m.id !== activeMap.id);
    setMaps(remaining);
    setActiveId(remaining[0]?.id ?? null);
    setActivePinId(null);
  }, [activeMap, isDM, maps]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    <div className="mm-backdrop" onClick={onClose}>
      <div className="mm-shell" onClick={e => e.stopPropagation()}>

        {/* ── Left sidebar: map list ── */}
        <aside className="mm-sidebar">
          <div className="mm-sidebar__header">
            <span className="mm-sidebar__title">🗺 Maps</span>
            {isDM && (
              <button className="mm-icon-btn" title="New map" onClick={() => setShowCreate(true)}>＋</button>
            )}
          </div>

          {loading && <div className="mm-hint mm-hint--center">Loading…</div>}
          {error   && <div className="mm-hint mm-hint--err">{error}</div>}

          <div className="mm-map-list">
            {maps.map(m => (
              <button
                key={m.id}
                className={`mm-map-item${m.id === activeId ? ' mm-map-item--active' : ''}`}
                onClick={() => { setActiveId(m.id); setActivePinId(null); setAddPinMode(false); }}
              >
                <span className="mm-map-item__type">{TYPE_LABELS[m.type] ?? m.type}</span>
                <span className="mm-map-item__name">{m.name}</span>
                {m.data?.visible_to_players && (
                  <span className="mm-badge mm-badge--shared" title="Shared with players">👁</span>
                )}
              </button>
            ))}
            {!loading && maps.length === 0 && (
              <div className="mm-hint">No maps yet{isDM ? ' — click ＋' : ''}.</div>
            )}
          </div>
        </aside>

        {/* ── Main viewer ── */}
        <main className="mm-main">
          {activeMap ? (
            <>
              {/* Toolbar */}
              <div className="mm-toolbar">
                <span className="mm-toolbar__name">{activeMap.name}</span>
                <span className="mm-toolbar__type">{TYPE_LABELS[activeMap.type] ?? activeMap.type}</span>

                {isDM && (
                  <>
                    <button
                      className={`mm-btn${addPinMode ? ' mm-btn--active' : ''}`}
                      onClick={() => setAddPinMode(v => !v)}
                      title="Click on the map to add a pin"
                    >
                      {addPinMode ? '✕ Cancel' : '📍 Add Pin'}
                    </button>
                    <button
                      className={`mm-btn${activeMap.data?.visible_to_players ? ' mm-btn--shared' : ''}`}
                      onClick={toggleVisibility}
                      title="Toggle player visibility for this map"
                    >
                      {activeMap.data?.visible_to_players ? '👁 Shared' : '🔒 DM Only'}
                    </button>
                    <ImageUploadButton
                      mapId={activeMap.id}
                      onUploaded={patchMap}
                    />
                    <button className="mm-btn mm-btn--danger" onClick={deleteActiveMap} title="Delete map">🗑</button>
                  </>
                )}

                {savingPins && <span className="mm-hint mm-hint--saving">Saving…</span>}
                <button className="mm-btn mm-btn--close" onClick={onClose}>✕ Close</button>
              </div>

              {/* Map canvas */}
              <div
                className={`mm-viewer${addPinMode ? ' mm-viewer--crosshair' : ''}`}
              >
                {activeMap.image_url ? (
                  <div
                    className="mm-img-wrap"
                    ref={imgWrapRef}
                    onClick={handleMapClick}
                  >
                    <img
                      src={activeMap.image_url}
                      alt={activeMap.name}
                      className="mm-img"
                      draggable={false}
                    />
                    {/* Pin overlay */}
                    <div className="mm-pins">
                      {pins.map(pin => (
                        <PinMarker
                          key={pin.id}
                          pin={pin}
                          isSelected={pin.id === activePinId}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (addPinMode) return;
                            setActivePinId(p => p === pin.id ? null : pin.id);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mm-no-image">
                    {isDM
                      ? <>No image yet — use the <strong>Upload Image</strong> button above.</>
                      : 'Map image not available.'}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mm-empty">
              {isDM ? 'Create your first map with the ＋ button.' : 'No maps shared with you yet.'}
            </div>
          )}
        </main>

        {/* ── Right panel: pin editor ── */}
        {activePin && isDM && (
          <PinEditor
            pin={activePin}
            npcs={npcs}
            encounters={encounters}
            quests={quests}
            onChange={(draft) => {
              const nextPins = pins.map(p => p.id === draft.id ? draft : p);
              savePins(activeMap.id, nextPins);
            }}
            onDelete={() => {
              const nextPins = pins.filter(p => p.id !== activePin.id);
              savePins(activeMap.id, nextPins);
              setActivePinId(null);
            }}
            onClose={() => setActivePinId(null)}
          />
        )}

        {/* Read-only pin detail for players */}
        {activePin && !isDM && (
          <PlayerPinView
            pin={activePin}
            npcs={npcs}
            quests={quests}
            onClose={() => setActivePinId(null)}
          />
        )}

      </div>

      {/* Create map modal */}
      {showCreate && (
        <CreateMapModal
          campaignId={campaignId}
          onCreated={(m) => {
            setMaps(prev => [...prev, m]);
            setActiveId(m.id);
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ── PinMarker ─────────────────────────────────────────────────────────────────
function PinMarker({ pin, isSelected, onClick }) {
  return (
    <button
      className={`mm-pin${isSelected ? ' mm-pin--selected' : ''}${!pin.shared ? ' mm-pin--dm' : ''}`}
      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, '--pin-color': pin.color }}
      onClick={onClick}
      title={pin.label}
    >
      <span className="mm-pin__icon">{pin.icon}</span>
      <span className="mm-pin__label">{pin.label}</span>
      {!pin.shared && <span className="mm-pin__dm-badge">DM</span>}
    </button>
  );
}

// ── PinEditor (DM) ────────────────────────────────────────────────────────────
function PinEditor({ pin, npcs, encounters, quests, onChange, onDelete, onClose }) {
  const [draft, setDraft] = useState(pin);

  // Sync when pin selection changes
  useEffect(() => { setDraft(pin); }, [pin.id]);

  const update = (key, val) =>
    setDraft(d => ({ ...d, [key]: val }));

  const updateLinks = (key, val) =>
    setDraft(d => ({ ...d, links: { ...d.links, [key]: val } }));

  const save = () => onChange(draft);

  const toggleLink = (key, id) => {
    const list = draft.links[key] ?? [];
    const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    updateLinks(key, next);
  };

  return (
    <aside className="mm-editor">
      <div className="mm-editor__header">
        <span className="mm-editor__title">Pin Editor</span>
        <button className="mm-icon-btn" onClick={onClose}>✕</button>
      </div>

      <div className="mm-editor__body">
        {/* Label */}
        <Field label="Label">
          <input
            className="mm-input"
            value={draft.label}
            onChange={e => update('label', e.target.value)}
            onBlur={save}
            onKeyDown={e => e.key === 'Enter' && save()}
          />
        </Field>

        {/* Notes */}
        <Field label="Notes (DM only unless shared)">
          <textarea
            className="mm-input mm-input--area"
            value={draft.notes}
            rows={4}
            onChange={e => update('notes', e.target.value)}
            onBlur={save}
          />
        </Field>

        {/* Shared toggle */}
        <Field label="Visibility">
          <button
            className={`mm-toggle${draft.shared ? ' mm-toggle--on' : ''}`}
            onClick={() => { update('shared', !draft.shared); save(); }}
          >
            {draft.shared ? '👁 Visible to players' : '🔒 DM only'}
          </button>
        </Field>

        {/* Icon + Color */}
        <Field label="Icon">
          <div className="mm-icon-grid">
            {PIN_ICONS.map(ic => (
              <button
                key={ic}
                className={`mm-icon-cell${draft.icon === ic ? ' mm-icon-cell--sel' : ''}`}
                onClick={() => { update('icon', ic); save(); }}
              >
                {ic}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Color">
          <div className="mm-color-row">
            {PIN_COLORS.map(c => (
              <button
                key={c}
                className={`mm-color-swatch${draft.color === c ? ' mm-color-swatch--sel' : ''}`}
                style={{ background: c }}
                onClick={() => { update('color', c); save(); }}
              />
            ))}
          </div>
        </Field>

        {/* Link: NPCs */}
        {npcs.length > 0 && (
          <Field label="Linked NPCs">
            <LinkList
              items={npcs}
              selected={draft.links.npcIds ?? []}
              onToggle={id => { toggleLink('npcIds', id); save(); }}
            />
          </Field>
        )}

        {/* Link: Encounters */}
        {encounters.length > 0 && (
          <Field label="Linked Encounters">
            <LinkList
              items={encounters.map(e => ({
                id: e.id,
                name: e.data?.title ?? e.data?.name ?? `Encounter #${e.id}`,
              }))}
              selected={draft.links.encounterIds ?? []}
              onToggle={id => { toggleLink('encounterIds', id); save(); }}
            />
          </Field>
        )}

        {/* Link: Quests */}
        {quests.length > 0 && (
          <Field label="Linked Quests">
            <LinkList
              items={quests.map(q => ({ id: q.id, name: q.title ?? `Quest #${q.id}` }))}
              selected={draft.links.questIds ?? []}
              onToggle={id => { toggleLink('questIds', id); save(); }}
            />
          </Field>
        )}
      </div>

      <div className="mm-editor__footer">
        <button className="mm-btn mm-btn--danger" onClick={onDelete}>🗑 Delete pin</button>
        <button className="mm-btn mm-btn--primary" onClick={save}>✓ Save</button>
      </div>
    </aside>
  );
}

// ── PlayerPinView (read-only) ─────────────────────────────────────────────────
function PlayerPinView({ pin, npcs, quests, onClose }) {
  const linkedNpcs   = (pin.links?.npcIds   ?? []).map(id => npcs.find(n => n.id === id)).filter(Boolean);
  const linkedQuests = (pin.links?.questIds ?? []).map(id => quests.find(q => q.id === id)).filter(Boolean);

  return (
    <aside className="mm-editor">
      <div className="mm-editor__header">
        <span className="mm-editor__title">{pin.icon} {pin.label}</span>
        <button className="mm-icon-btn" onClick={onClose}>✕</button>
      </div>
      <div className="mm-editor__body">
        {pin.notes && (
          <div className="mm-section">
            <div className="mm-section__title">Notes</div>
            <div className="mm-section__body">{pin.notes}</div>
          </div>
        )}
        {linkedNpcs.length > 0 && (
          <div className="mm-section">
            <div className="mm-section__title">NPCs</div>
            {linkedNpcs.map(n => <div key={n.id} className="mm-link-item">{n.name}</div>)}
          </div>
        )}
        {linkedQuests.length > 0 && (
          <div className="mm-section">
            <div className="mm-section__title">Quests</div>
            {linkedQuests.map(q => <div key={q.id} className="mm-link-item">{q.title ?? `Quest #${q.id}`}</div>)}
          </div>
        )}
        {!pin.notes && linkedNpcs.length === 0 && linkedQuests.length === 0 && (
          <div className="mm-hint">No details recorded.</div>
        )}
      </div>
    </aside>
  );
}

// ── CreateMapModal ────────────────────────────────────────────────────────────
function CreateMapModal({ campaignId, onCreated, onClose }) {
  const [name,     setName]     = useState('');
  const [type,     setType]     = useState('dungeon');
  const [imgFile,  setImgFile]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');
  const fileRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Name is required.'); return; }
    setSaving(true);
    setErr('');
    try {
      // 1. Create map record
      const map = await api.createMap({ campaign_id: campaignId, name: name.trim(), type });
      // 2. Upload image if provided
      if (imgFile) {
        const updated = await api.uploadMapImage(map.id, imgFile);
        onCreated(updated);
      } else {
        onCreated(map);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mm-modal-backdrop" onClick={onClose}>
      <div className="mm-modal" onClick={e => e.stopPropagation()}>
        <div className="mm-modal__header">
          <span>New Map</span>
          <button className="mm-icon-btn" onClick={onClose}>✕</button>
        </div>
        <form className="mm-modal__body" onSubmit={handleSubmit}>
          {err && <div className="mm-hint mm-hint--err">{err}</div>}

          <Field label="Name">
            <input
              className="mm-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Dungeon Level 1"
              autoFocus
            />
          </Field>

          <Field label="Type">
            <select className="mm-input" value={type} onChange={e => setType(e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>

          <Field label="Image (optional — upload later if needed)">
            <button
              type="button"
              className="mm-btn"
              onClick={() => fileRef.current.click()}
            >
              {imgFile ? `✓ ${imgFile.name}` : '📁 Choose image…'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => setImgFile(e.target.files[0] ?? null)}
            />
          </Field>

          <div className="mm-modal__footer">
            <button type="button" className="mm-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="mm-btn mm-btn--primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create Map'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── ImageUploadButton ─────────────────────────────────────────────────────────
function ImageUploadButton({ mapId, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const updated = await api.uploadMapImage(mapId, file);
      onUploaded(updated);
    } catch (err) {
      console.error('[ImageUploadButton]', err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <>
      <button
        className="mm-btn"
        onClick={() => fileRef.current.click()}
        disabled={uploading}
        title="Upload or replace map image"
      >
        {uploading ? '⏳ Uploading…' : '🖼 Upload Image'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </>
  );
}

// ── Small layout helpers ───────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="mm-field">
      <div className="mm-field__label">{label}</div>
      {children}
    </div>
  );
}

function LinkList({ items, selected, onToggle }) {
  return (
    <div className="mm-link-list">
      {items.map(item => (
        <button
          key={item.id}
          className={`mm-link-chip${selected.includes(item.id) ? ' mm-link-chip--on' : ''}`}
          onClick={() => onToggle(item.id)}
        >
          {selected.includes(item.id) ? '✓ ' : ''}{item.name}
        </button>
      ))}
    </div>
  );
}

export default MapManager;
