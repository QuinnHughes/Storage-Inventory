import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

const MATERIAL_TYPES = [
  "general stacks", "microfilm", "microfiche", "oversize",
  "special collections", "elec media", "documents",
];

export default function RangeEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const facility = localStorage.getItem("mappingFacility") || "storage";

  const [range, setRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [morganLocations, setMorganLocations] = useState([]);
  const [tab, setTab] = useState("structure"); // "metadata" | "structure"
  const [activeSide, setActiveSide] = useState(null);
  const [error, setError] = useState("");

  // Metadata
  const [materialType, setMaterialType] = useState("general stacks");
  const [notes, setNotes] = useState("");
  const [locationCodes, setLocationCodes] = useState([]);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaMsg, setMetaMsg] = useState("");

  // Shelf editing — keyed by shelf.id
  const [shelfWidths, setShelfWidths] = useState({});
  const [shelfFills, setShelfFills]   = useState({});
  const [savingWidths, setSavingWidths] = useState(null); // ladderId

  // Add ladder form
  const [addLadderSideId, setAddLadderSideId] = useState(null);
  const [newLadderShelfCount, setNewLadderShelfCount] = useState("6");
  const [newLadderWidth, setNewLadderWidth] = useState("");
  const [newLadderFill, setNewLadderFill]   = useState("");
  const [addingLadder, setAddingLadder] = useState(false);

  // Add shelves form
  const [addShelvesLadderId, setAddShelvesLadderId] = useState(null);
  const [newShelfCount, setNewShelfCount] = useState("1");
  const [newShelfWidth, setNewShelfWidth] = useState("");
  const [newShelfFill, setNewShelfFill]   = useState("");
  const [addingShelves, setAddingShelves] = useState(false);

  // Confirmations
  const [confirmDeleteLadder, setConfirmDeleteLadder] = useState(null);
  const [confirmDeleteShelf, setConfirmDeleteShelf] = useState(null);
  const [deletingLadder, setDeletingLadder] = useState(null);
  const [deletingShelf, setDeletingShelf] = useState(null);

  const refresh = useCallback(() => {
    setLoading(true);
    api.getRange(id)
      .then(r => {
        setRange(r);
        setMaterialType(r.material_type || "general stacks");
        setNotes(r.notes || "");
        setLocationCodes(r.location_codes || []);
        const widths = {};
        const fills = {};
        for (const side of r.sides)
          for (const ladder of side.ladders)
            for (const shelf of ladder.shelves) {
              widths[shelf.id] = shelf.width_inches != null ? String(shelf.width_inches) : "";
              fills[shelf.id]  = shelf.fill_inches  != null ? String(shelf.fill_inches)  : "";
            }
        setShelfWidths(widths);
        setShelfFills(fills);
        setActiveSide(prev => {
          const letters = r.sides.map(s => s.side_letter);
          return letters.includes(prev) ? prev : (letters[0] ?? null);
        });
      })
      .catch(() => setError("Failed to load range."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (facility === "morgan") {
      api.getLocations("morgan").then(setMorganLocations).catch(() => {});
    }
  }, [facility]);

  // ── Metadata ──────────────────────────────────────────────────────────────

  const saveMeta = async () => {
    setSavingMeta(true);
    setMetaMsg("");
    try {
      await api.updateRange(id, {
        material_type: materialType,
        notes: notes || null,
        location_codes: locationCodes,
      });
      setMetaMsg("Saved!");
      setTimeout(() => setMetaMsg(""), 2500);
      refresh();
    } catch (e) {
      setMetaMsg(e.message);
    } finally {
      setSavingMeta(false);
    }
  };

  // ── Shelf widths ──────────────────────────────────────────────────────────

  const saveWidths = async (ladder) => {
    setSavingWidths(ladder.id);
    try {
      for (const shelf of ladder.shelves) {
        const w = shelfWidths[shelf.id];
        const f = shelfFills[shelf.id];
        await api.updateShelf(shelf.id, {
          width_inches: w !== "" && w != null ? parseFloat(w) : null,
          fill_inches:  f !== "" && f != null ? parseFloat(f) : null,
        });
      }
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingWidths(null);
    }
  };

  // ── Ladder management ─────────────────────────────────────────────────────

  const doAddLadder = async (sideId) => {
    setAddingLadder(true);
    try {
      await api.addLadderToSide(sideId, {
        shelves_count: parseInt(newLadderShelfCount, 10) || 0,
        width_inches: newLadderWidth !== "" ? parseFloat(newLadderWidth) : null,
        fill_inches:  newLadderFill  !== "" ? parseFloat(newLadderFill)  : null,
      });
      setAddLadderSideId(null);
      setNewLadderShelfCount("6");
      setNewLadderWidth("");
      setNewLadderFill("");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingLadder(false);
    }
  };

  const doDeleteLadder = async (ladderId) => {
    setDeletingLadder(ladderId);
    try {
      await api.deleteLadder(ladderId);
      setConfirmDeleteLadder(null);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeletingLadder(null);
    }
  };

  // ── Shelf management ──────────────────────────────────────────────────────

  const doAddShelves = async (ladderId) => {
    setAddingShelves(true);
    try {
      await api.addShelvesToLadder(ladderId, {
        count: parseInt(newShelfCount, 10) || 1,
        width_inches: newShelfWidth !== "" ? parseFloat(newShelfWidth) : null,
        fill_inches:  newShelfFill  !== "" ? parseFloat(newShelfFill)  : null,
      });
      setAddShelvesLadderId(null);
      setNewShelfCount("1");
      setNewShelfWidth("");
      setNewShelfFill("");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingShelves(false);
    }
  };

  const doDeleteShelf = async (shelfId) => {
    setDeletingShelf(shelfId);
    try {
      await api.deleteShelf(shelfId);
      setConfirmDeleteShelf(null);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeletingShelf(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !range) return <p className="text-sm text-gray-400 py-10">Loading…</p>;
  if (!range) return <p className="text-sm text-red-500 py-10">Range not found.</p>;

  const currentSide = range.sides.find(s => s.side_letter === activeSide);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/mapping/ranges")} className="text-sm text-gray-400 hover:text-gray-600">
          ← Range List
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>
          Range {range.range_number}
        </h1>
        {range.material_type && (
          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
            {range.material_type}
          </span>
        )}
        {range.location_codes.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {range.location_codes.map(c => (
              <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono">{c}</span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 rounded px-3 py-2 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </p>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-5">
        {["metadata", "structure"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${
              tab === t ? "border-green-700 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Metadata tab ─────────────────────────────────────────────────────── */}
      {tab === "metadata" && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Material Type</label>
            <select
              value={materialType}
              onChange={e => setMaterialType(e.target.value)}
              className="w-56 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
            >
              {MATERIAL_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input
              type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
              placeholder="Optional notes about this range"
            />
          </div>

          {facility === "morgan" && morganLocations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location Codes <span className="text-gray-400 font-normal">(select all that apply)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {morganLocations.map(loc => (
                  <button key={loc.id} type="button"
                    onClick={() => setLocationCodes(prev =>
                      prev.includes(loc.code) ? prev.filter(c => c !== loc.code) : [...prev, loc.code]
                    )}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      locationCodes.includes(loc.code)
                        ? "bg-green-700 text-white border-green-700"
                        : "bg-white text-gray-600 border-gray-300 hover:border-green-600"
                    }`}
                  >
                    <span className="font-mono font-semibold">{loc.code}</span>
                    <span className="ml-1.5 text-xs opacity-75">{loc.display_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveMeta}
              disabled={savingMeta}
              className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "#1E4D2B" }}
            >
              {savingMeta ? "Saving…" : "Save Metadata"}
            </button>
            {metaMsg && (
              <span className={`text-sm ${metaMsg === "Saved!" ? "text-green-700" : "text-red-600"}`}>
                {metaMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Structure tab ─────────────────────────────────────────────────────── */}
      {tab === "structure" && (
        <div>
          {range.sides.length === 0 ? (
            <p className="text-sm text-gray-400">No sides defined for this range.</p>
          ) : (
            <>
              {/* Side selector */}
              <div className="flex gap-2 mb-4">
                {range.sides.map(side => (
                  <button key={side.id}
                    onClick={() => setActiveSide(side.side_letter)}
                    className={`w-10 h-10 rounded-lg text-sm font-bold border transition-all ${
                      activeSide === side.side_letter
                        ? "border-green-700 bg-green-700 text-white"
                        : "border-gray-300 bg-white text-gray-500 hover:border-gray-400"
                    }`}
                  >
                    {side.side_letter}
                  </button>
                ))}
              </div>

              {currentSide && (
                <div className="space-y-3">
                  {currentSide.ladders.length === 0 && (
                    <p className="text-sm text-gray-400 italic mb-1">No ladders on Side {currentSide.side_letter} yet.</p>
                  )}

                  {currentSide.ladders.map(ladder => (
                    <div key={ladder.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                      {/* Ladder header */}
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <span className="text-sm font-semibold text-gray-700">
                          Ladder {ladder.ladder_number}
                          <span className="ml-2 text-xs text-gray-400 font-normal">
                            {ladder.shelves.length} shelf{ladder.shelves.length !== 1 ? "ves" : ""}
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          {confirmDeleteLadder === ladder.id ? (
                            <span className="flex items-center gap-2 text-xs">
                              <span className="text-gray-500">Delete this ladder + all its shelves?</span>
                              <button
                                onClick={() => doDeleteLadder(ladder.id)}
                                disabled={deletingLadder === ladder.id}
                                className="text-red-600 hover:text-red-800 font-medium"
                              >
                                {deletingLadder === ladder.id ? "Deleting…" : "Yes, delete"}
                              </button>
                              <button onClick={() => setConfirmDeleteLadder(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteLadder(ladder.id)}
                              className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                            >
                              Delete Ladder
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Shelves */}
                      <div className="p-4">
                        {ladder.shelves.length === 0 ? (
                          <p className="text-xs text-gray-400 italic mb-3">No shelves yet. Add some below.</p>
                        ) : (
                          <div className="grid grid-cols-5 gap-2 mb-3">
                            {ladder.shelves.map(shelf => (
                              <div key={shelf.id} className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-400">#{shelf.shelf_number}</span>
                                  {confirmDeleteShelf === shelf.id ? (
                                    <span className="flex items-center gap-1">
                                      <button
                                        onClick={() => doDeleteShelf(shelf.id)}
                                        disabled={deletingShelf === shelf.id}
                                        className="text-xs text-red-600 font-medium"
                                      >
                                        {deletingShelf === shelf.id ? "…" : "Del?"}
                                      </button>
                                      <button onClick={() => setConfirmDeleteShelf(null)} className="text-xs text-gray-400">✕</button>
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmDeleteShelf(shelf.id)}
                                      className="text-xs text-gray-300 hover:text-red-500 leading-none"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="number" step="0.5" min="0"
                                  value={shelfWidths[shelf.id] ?? ""}
                                  onChange={e => setShelfWidths(prev => ({ ...prev, [shelf.id]: e.target.value }))}
                                  placeholder="Total"
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                                />
                                <input
                                  type="number" step="0.5" min="0"
                                  value={shelfFills[shelf.id] ?? ""}
                                  onChange={e => setShelfFills(prev => ({ ...prev, [shelf.id]: e.target.value }))}
                                  placeholder="Fill"
                                  className="w-full rounded border border-blue-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Ladder action row */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {ladder.shelves.length > 0 && (
                            <button
                              onClick={() => saveWidths(ladder)}
                              disabled={savingWidths === ladder.id}
                              className="text-xs px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-50"
                              style={{ backgroundColor: "#1E4D2B" }}
                            >
                              {savingWidths === ladder.id ? "Saving…" : "Save widths"}
                            </button>
                          )}

                          {addShelvesLadderId === ladder.id ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="number" min="1" max="99"
                                value={newShelfCount}
                                onChange={e => setNewShelfCount(e.target.value)}
                                className="w-14 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-700"
                                placeholder="#"
                              />
                              <span className="text-xs text-gray-500">shelves, total:</span>
                              <input
                                type="number" step="0.5" min="0"
                                value={newShelfWidth}
                                onChange={e => setNewShelfWidth(e.target.value)}
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-700"
                                placeholder="in."
                              />
                              <span className="text-xs text-gray-500">fill:</span>
                              <input
                                type="number" step="0.5" min="0"
                                value={newShelfFill}
                                onChange={e => setNewShelfFill(e.target.value)}
                                className="w-20 rounded border border-blue-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="in."
                              />
                              <button
                                onClick={() => doAddShelves(ladder.id)}
                                disabled={addingShelves}
                                className="text-xs px-3 py-1 rounded border border-green-700 text-green-700 hover:bg-green-50 disabled:opacity-50"
                              >
                                {addingShelves ? "Adding…" : "Add"}
                              </button>
                              <button
                                onClick={() => setAddShelvesLadderId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddShelvesLadderId(ladder.id)}
                              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:border-green-700 hover:text-green-700 transition-colors"
                            >
                              + Add shelves
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add Ladder */}
                  <div className="mt-1">
                    {addLadderSideId === currentSide.id ? (
                      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                        <p className="text-sm font-medium text-gray-700 mb-3">
                          New Ladder — Side {currentSide.side_letter}
                        </p>
                        <div className="flex items-end gap-4 flex-wrap">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Shelf count</label>
                            <input
                              type="number" min="0" max="99"
                              value={newLadderShelfCount}
                              onChange={e => setNewLadderShelfCount(e.target.value)}
                              className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Default total <span className="text-gray-400">(optional)</span></label>
                            <input
                              type="number" step="0.5" min="0"
                              value={newLadderWidth}
                              onChange={e => setNewLadderWidth(e.target.value)}
                              placeholder="in."
                              className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Default fill <span className="text-gray-400">(optional)</span></label>
                            <input
                              type="number" step="0.5" min="0"
                              value={newLadderFill}
                              onChange={e => setNewLadderFill(e.target.value)}
                              placeholder="in."
                              className="w-24 rounded border border-blue-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => doAddLadder(currentSide.id)}
                            disabled={addingLadder}
                            className="px-4 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                            style={{ backgroundColor: "#1E4D2B" }}
                          >
                            {addingLadder ? "Adding…" : "Add Ladder"}
                          </button>
                          <button
                            onClick={() => setAddLadderSideId(null)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddLadderSideId(currentSide.id)}
                        className="text-sm px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-green-700 hover:text-green-700 transition-colors w-full"
                      >
                        + Add Ladder to Side {currentSide.side_letter}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
