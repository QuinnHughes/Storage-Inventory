import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

const STATUS_COLOR = {
  scanning: "bg-blue-100 text-blue-800",
  analyzed: "bg-amber-100 text-amber-800",
  complete: "bg-green-100 text-green-800",
};

export default function Scanning() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const PER_PAGE = 20;

  const load = () => {
    setLoading(true);
    api.listSessions(page, PER_PAGE)
      .then(r => { setSessions(r.items); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [page]);

  const startSession = async () => {
    try {
      const s = await api.createSession({ location_label: newLabel.trim() || null });
      navigate(`/morgan/scanning/${s.id}`);
    } catch (e) {
      alert(e.message);
    }
  };

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
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "#1E4D2B" }}
        >
          + New Session
        </button>
      </div>

      {/* New session dialog */}
      {creating && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl shadow-sm p-5 max-w-xl">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">New Scan Session</h2>
          <label className="block text-xs text-gray-500 mb-1">Location label (optional)</label>
          <input
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2"
            placeholder="e.g. Floor 1, Range 02A, Ladder 3, Shelf 4"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && startSession()}
          />
          <div className="flex gap-2">
            <button
              onClick={startSession}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: "#1E4D2B" }}
            >
              Start Scanning
            </button>
            <button
              onClick={() => { setCreating(false); setNewLabel(""); }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
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
                      <span className="font-medium text-gray-800">
                        {s.location_label || <span className="text-gray-400 italic">No label</span>}
                      </span>
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
