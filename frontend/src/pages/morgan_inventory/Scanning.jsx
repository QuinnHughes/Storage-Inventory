import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

const STATUS_COLOR = {
  scanning: "bg-blue-100 text-blue-800",
  analyzed: "bg-amber-100 text-amber-800",
  complete: "bg-green-100 text-green-800",
};

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
      .finally(() => setLoading(false));
  };

  useEffect(load, [page]);

  const deleteSession = async (id) => {
    if (!confirm("Delete this scan session and all its data?")) return;
    await api.deleteSession(id);
    load();
  };

  const totalPages = Math.ceil(total / PER_PAGE);

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
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">No scan sessions yet. Start one above.</p>
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
                        onClick={() => deleteSession(s.id)}
                        className="text-xs text-red-400 hover:text-red-700 px-2 py-1"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>{total} sessions</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40">← Prev</button>
                <span className="px-3 py-1">{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
