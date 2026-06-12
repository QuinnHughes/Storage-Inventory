import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

// ── Shelf status helpers ──────────────────────────────────────────────────────

function shelfClasses(shelf, creating) {
  if (creating === shelf.id)
    return "bg-gray-100 text-gray-400 border-gray-200 cursor-wait";
  switch (shelf.last_status) {
    case "complete":
      return "bg-green-100 text-green-800 border-green-300 hover:bg-green-200";
    case "analyzed":
      return "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200";
    case "scanning":
      return "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200";
    default:
      return "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300";
  }
}

function shelfTitle(shelf) {
  if (shelf.last_scanned_at)
    return `Last scanned: ${new Date(shelf.last_scanned_at).toLocaleDateString()}  (${shelf.session_count} session${shelf.session_count !== 1 ? "s" : ""})`;
  return "Never scanned";
}

// ── Range progress helpers ────────────────────────────────────────────────────

function rangeStats(range) {
  let total = 0, done = 0;
  for (const side of range.sides)
    for (const ladder of side.ladders)
      for (const shelf of ladder.shelves) {
        total++;
        if (shelf.session_count > 0) done++;
      }
  return { total, done };
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Location Picker ───────────────────────────────────────────────────────────
function LocationPicker({ onStart, onCancel }) {
  const [floors, setFloors]           = useState([]);
  const [ranges, setRanges]           = useState([]);
  const [rangeDetail, setRangeDetail] = useState(null);
  const [selFloor, setSelFloor]       = useState(null);
  const [selRange, setSelRange]       = useState(null);
  const [selSide, setSelSide]         = useState(null);
  const [loadingFloors, setLoadingFloors] = useState(true);
  const [loadingRanges, setLoadingRanges] = useState(false);
  const [starting, setStarting]       = useState(false);

  // Load Morgan floors once
  useEffect(() => {
    api.getFloors("morgan")
      .then(setFloors)
      .catch(() => {})
      .finally(() => setLoadingFloors(false));
  }, []);

  const selectFloor = (floor) => {
    if (selFloor?.id === floor.id) return;
    setSelFloor(floor);
    setSelRange(null);
    setRangeDetail(null);
    setSelSide(null);
    setRanges([]);
    setLoadingRanges(true);
    api.getRanges(floor.id)
      .then(setRanges)
      .catch(() => {})
      .finally(() => setLoadingRanges(false));
  };

  const selectRange = (range) => {
    if (selRange?.id === range.id) return;
    setSelRange(range);
    setRangeDetail(null);
    setSelSide(null);
    api.getRange(range.id)
      .then(setRangeDetail)
      .catch(() => {});
  };

  const handleStart = async () => {
    if (!selSide) return;
    setStarting(true);
    try {
      const s = await api.createSession({ range_side_id: selSide.id });
      onStart(s.id);
    } catch (e) {
      alert(e.message);
      setStarting(false);
    }
  };

  const colBase = "rounded-lg px-3 py-2 text-sm text-left w-full border transition-colors";
  const colActive = "border-green-700 bg-green-50 text-green-900 font-medium";
  const colIdle   = "border-gray-200 bg-white text-gray-700 hover:border-green-400 hover:bg-green-50";

  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">New Scan Session — Select Location</h2>
      <div className="grid grid-cols-3 gap-4">

        {/* Column 1: Floors */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Floor</p>
          {loadingFloors ? (
            <p className="text-xs text-gray-400 italic">Loading…</p>
          ) : floors.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No Morgan floors configured.</p>
          ) : (
            <div className="space-y-1">
              {floors.map(f => (
                <button key={f.id} onClick={() => selectFloor(f)}
                  className={`${colBase} ${selFloor?.id === f.id ? colActive : colIdle}`}>
                  {f.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: Ranges */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Range</p>
          {!selFloor ? (
            <p className="text-xs text-gray-400 italic">Select a floor first</p>
          ) : loadingRanges ? (
            <p className="text-xs text-gray-400 italic">Loading…</p>
          ) : ranges.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No ranges on this floor.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {ranges.map(r => (
                <button key={r.id} onClick={() => selectRange(r)}
                  className={`${colBase} ${selRange?.id === r.id ? colActive : colIdle}`}>
                  <span className="font-mono">Range {r.range_number}</span>
                  {r.material_type && (
                    <span className="ml-2 text-xs text-gray-400">{r.material_type}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Column 3: Sides */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Side</p>
          {!selRange ? (
            <p className="text-xs text-gray-400 italic">Select a range first</p>
          ) : !rangeDetail ? (
            <p className="text-xs text-gray-400 italic">Loading…</p>
          ) : rangeDetail.sides.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No sides for this range.</p>
          ) : (
            <div className="space-y-1">
              {rangeDetail.sides.map(side => (
                <button key={side.id} onClick={() => setSelSide(side)}
                  className={`${colBase} ${selSide?.id === side.id ? colActive : colIdle}`}>
                  Side {side.side_letter}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary + actions */}
      {selSide && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
          <span className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">{selFloor.display_name}</span>
            {" · "}Range {selRange.range_number}
            {" · "}Side {selSide.side_letter}
          </span>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          onClick={handleStart}
          disabled={!selSide || starting}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
          style={{ backgroundColor: "#1E4D2B" }}
        >
          {starting ? "Starting…" : "Start Scanning"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Session location display ──────────────────────────────────────────────────
function LocationCell({ session: s }) {
  if (s.location) {
    return (
      <div>
        <span className="font-medium text-gray-800">
          Range {s.location.range_number} · Side {s.location.side_letter}
        </span>
        <span className="block text-xs text-gray-400 mt-0.5">{s.location.floor_display_name}</span>
      </div>
    );
  }
  return (
    <span className="text-gray-700">
      {s.location_label || <span className="text-gray-400 italic">No label</span>}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Scanning() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);

  const PER_PAGE = 20;

  const load = () => {
    setLoading(true);
    api.listSessions(page, PER_PAGE)
      .then(r => { setSessions(r.items); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoadingFloors(false));
  }, []);

  // Reload tree when floor selection changes
  useEffect(() => {
    if (!selectedFloorId) return;
    setLoadingTree(true);
    setTreeData(null);
    setExpandedRanges(new Set());
    api.getFloorScanStatus(selectedFloorId)
      .then(setTreeData)
      .catch(() => {})
      .finally(() => setLoadingTree(false));
  }, [selectedFloorId]);

  const deleteSession = async (id) => {
    if (!confirm("Delete this scan session and all its data?")) return;
    await api.deleteSession(id);
    load();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#1E4D2B" }}>Scanning</h1>
          <p className="text-sm text-gray-500 mt-1">Shelf-reading sessions — scan a shelf, analyse, find discrepancies.</p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: "#1E4D2B" }}
          >
            + New Session
          </button>
        )}
      </div>

      {/* Location picker */}
      {creating && (
        <LocationPicker
          onStart={(id) => navigate(`/morgan/scanning/${id}`)}
          onCancel={() => setCreating(false)}
        />
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : floors.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🗺️</p>
          <p className="text-sm">No floors found for Morgan. Add floors in Data Entry first.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">Location</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Items</th>
                  <th className="px-4 py-3 text-right">Discrepancies</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <LocationCell session={s} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{s.item_count}</td>
                    <td className="px-4 py-3 text-right">
                      {s.discrepancy_count > 0 ? (
                        <span className="font-mono text-amber-700 font-medium">{s.discrepancy_count}</span>
                      ) : (
                        <span className="font-mono text-gray-400">{s.discrepancy_count}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/morgan/scanning/${s.id}`)}
                        className="text-xs font-medium px-3 py-1 rounded-lg mr-2"
                        style={{ color: "#1E4D2B" }}
                      >
                        {s.status === "scanning" ? "Continue" : "View"}
                      </button>
                      <button
                        onClick={() => toggleRange(rng.id)}
                        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                      >
                        <span
                          className="text-base font-bold font-mono w-14 shrink-0"
                          style={{ color: "#1E4D2B" }}
                        >
                          {rng.range_number}
                        </span>

                        {rng.material_type && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">
                            {rng.material_type}
                          </span>
                        )}

                        {/* Progress bar */}
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: pct === 100 ? "#1E4D2B" : "#6EBF8B",
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                            {done}/{total}
                          </span>
                        </div>

                        <span className="text-gray-400 text-xs shrink-0 ml-1">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </button>

                      {/* Expanded ladder/shelf view */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 py-4 space-y-5">
                          {rng.sides.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No sides defined for this range.</p>
                          ) : (
                            rng.sides.map(side => (
                              <div key={side.id}>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                  Side {side.side_letter}
                                </p>

                                {side.ladders.length === 0 ? (
                                  <p className="text-xs text-gray-400 italic pl-1">No ladders defined.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {side.ladders.map(ladder => (
                                      <div key={ladder.id} className="flex items-start gap-3">
                                        <span className="text-xs font-mono text-gray-400 w-16 shrink-0 pt-1.5">
                                          Ldr {ladder.ladder_number}
                                        </span>

                                        <div className="flex flex-wrap gap-1.5">
                                          {ladder.shelves.length === 0 ? (
                                            <span className="text-xs text-gray-400 italic">No shelves.</span>
                                          ) : (
                                            ladder.shelves.map(shelf => (
                                              <button
                                                key={shelf.id}
                                                onClick={() => handleShelfClick(shelf)}
                                                disabled={creating === shelf.id}
                                                title={shelfTitle(shelf)}
                                                className={`w-10 h-10 text-xs font-mono rounded-lg border transition-colors ${shelfClasses(shelf, creating)}`}
                                              >
                                                {shelf.shelf_number}
                                              </button>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-5 flex items-center gap-5 text-xs text-gray-500 flex-wrap">
                <span className="font-medium text-gray-600">Legend:</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded border border-gray-200 bg-white inline-block" />
                  Not scanned
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded border border-amber-300 bg-amber-100 inline-block" />
                  In progress
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded border border-green-300 bg-green-100 inline-block" />
                  Complete
                </span>
              </div>

              {/* ── Rescan modal ── */}
              {rescanModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                  onClick={() => setRescanModal(null)}>
                  <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4"
                    onClick={e => e.stopPropagation()}>
                    <h2 className="text-base font-semibold text-gray-800">
                      Shelf already scanned
                    </h2>
                    <p className="text-sm text-gray-500">
                      This shelf has a previous scan on record. What would you like to do?
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={() => { setRescanModal(null); navigate(`/morgan/scanning/${rescanModal.last_session_id}`); }}
                        className="w-full py-2.5 text-sm font-medium text-white rounded-lg"
                        style={{ backgroundColor: "#1E4D2B" }}>
                        View Last Scan
                      </button>
                      <button
                        onClick={() => handleRescan(rescanModal)}
                        className="w-full py-2.5 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                        Rescan Shelf
                      </button>
                      <button
                        onClick={() => setRescanModal(null)}
                        className="w-full py-2.5 text-sm text-gray-400 hover:text-gray-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
