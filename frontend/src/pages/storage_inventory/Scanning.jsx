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
  const [creating, setCreating] = useState(null);
  const [rescanModal, setRescanModal] = useState(null);

  // Load storage floors on mount
  useEffect(() => {
    api.getFloors("storage")
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
      navigate(`/storage/scanning/${shelf.active_session_id}`);
      return;
    }
    if (shelf.last_session_id) {
      setRescanModal(shelf);
      return;
    }
    setCreating(shelf.id);
    try {
      const session = await api.createSession({ shelf_id: shelf.id });
      navigate(`/storage/scanning/${session.id}`);
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
      navigate(`/storage/scanning/${session.id}`);
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
          <p className="text-sm">No floors found for Storage. Add floors in Data Entry first.</p>
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

                        <span className="text-gray-300 text-xs shrink-0">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </button>

                      {/* Expanded: sides → ladders → shelves */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                          {rng.sides.map(side => (
                            <div key={side.id}>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                Side {side.side_letter}
                              </p>
                              <div className="space-y-3">
                                {side.ladders.map(ladder => (
                                  <div key={ladder.id}>
                                    <p className="text-xs text-gray-400 mb-1.5">
                                      Ladder {ladder.ladder_number}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {ladder.shelves.map(shelf => (
                                        <button
                                          key={shelf.id}
                                          title={shelfTitle(shelf)}
                                          onClick={() => handleShelfClick(shelf)}
                                          disabled={creating === shelf.id}
                                          className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-all ${shelfClasses(shelf, creating)}`}
                                        >
                                          {creating === shelf.id ? "…" : shelf.shelf_number}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 flex gap-4 flex-wrap">
                {[
                  { color: "bg-white border-gray-200", label: "Not scanned" },
                  { color: "bg-amber-100 border-amber-300", label: "In progress" },
                  { color: "bg-blue-100 border-blue-300", label: "Analyzed" },
                  { color: "bg-green-100 border-green-300", label: "Complete" },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`inline-block w-3 h-3 rounded border ${color}`} />
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Rescan confirmation modal */}
      {rescanModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Start a new scan?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Shelf <span className="font-mono font-medium">{rescanModal.shelf_number}</span> has
              already been scanned {rescanModal.session_count} time
              {rescanModal.session_count !== 1 ? "s" : ""}. Starting a new session won't delete the
              previous one.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRescanModal(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRescan(rescanModal)}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg"
                style={{ backgroundColor: "#1E4D2B" }}
              >
                Start New Scan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
