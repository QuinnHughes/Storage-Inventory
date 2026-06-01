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

export default function Scanning() {
  const navigate = useNavigate();

  const [floors, setFloors] = useState([]);
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [treeData, setTreeData] = useState(null);
  const [loadingFloors, setLoadingFloors] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [expandedRanges, setExpandedRanges] = useState(new Set());
  const [creating, setCreating] = useState(null); // shelf.id currently being created
  const [rescanModal, setRescanModal] = useState(null); // shelf object awaiting rescan decision

  // Load morgan floors on mount
  useEffect(() => {
    api.getFloors("morgan")
      .then(data => {
        setFloors(data);
        if (data.length > 0) setSelectedFloorId(data[0].id);
      })
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

  const toggleRange = (rangeId) => {
    setExpandedRanges(prev => {
      const next = new Set(prev);
      next.has(rangeId) ? next.delete(rangeId) : next.add(rangeId);
      return next;
    });
  };

  const handleShelfClick = async (shelf) => {
    if (shelf.active_session_id) {
      navigate(`/morgan/scanning/${shelf.active_session_id}`);
      return;
    }
    if (shelf.last_session_id) {
      setRescanModal(shelf);
      return;
    }
    setCreating(shelf.id);
    try {
      const session = await api.createSession({ shelf_id: shelf.id });
      navigate(`/morgan/scanning/${session.id}`);
    } catch (e) {
      alert(e.message);
      setCreating(null);
    }
  };

  const handleRescan = async (shelf) => {
    setRescanModal(null);
    setCreating(shelf.id);
    try {
      const session = await api.createSession({ shelf_id: shelf.id });
      navigate(`/morgan/scanning/${session.id}`);
    } catch (e) {
      alert(e.message);
      setCreating(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold" style={{ color: "#1E4D2B" }}>Scanning</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select a location — expand a range, then click a shelf to start or resume scanning.
        </p>
      </div>

      {loadingFloors ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : floors.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🗺️</p>
          <p className="text-sm">No floors found for Morgan. Add floors in Data Entry first.</p>
        </div>
      ) : (
        <>
          {/* Floor tabs */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {floors.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFloorId(f.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  selectedFloorId === f.id
                    ? "text-white border-transparent"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                style={selectedFloorId === f.id ? { backgroundColor: "#1E4D2B" } : {}}
              >
                {f.display_name}
              </button>
            ))}
          </div>

          {loadingTree ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !treeData || treeData.ranges.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-sm">No ranges defined for this floor. Add ranges in Data Entry.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {treeData.ranges.map(rng => {
                  const { total, done } = rangeStats(rng);
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  const isExpanded = expandedRanges.has(rng.id);

                  return (
                    <div
                      key={rng.id}
                      className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
                    >
                      {/* Range header row */}
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
