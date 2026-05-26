import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function RangeList() {
  const navigate = useNavigate();
  const [floors, setFloors] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [ranges, setRanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    api.getFloors()
      .then((fs) => {
        setFloors(fs);
        if (fs.length > 0) selectFloor(fs[0]);
      })
      .catch(() => setError("Could not load floors."));
  }, []);

  const selectFloor = (floor) => {
    setSelectedFloor(floor);
    setLoading(true);
    setRanges([]);
    api.getRanges(floor.id)
      .then(setRanges)
      .catch(() => setError("Could not load ranges."))
      .finally(() => setLoading(false));
  };

  const handleDelete = async (rangeId) => {
    setDeleting(rangeId);
    try {
      await api.deleteRange(rangeId);
      setRanges((prev) => prev.filter((r) => r.id !== rangeId));
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/mapping")} className="text-sm text-gray-400 hover:text-gray-600">
          ← Mapping
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>Range List</h1>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      {/* Floor tabs */}
      <div className="flex gap-2 mb-6">
        {floors.map((f) => (
          <button
            key={f.id}
            onClick={() => selectFloor(f)}
            className={[
              "px-4 py-1.5 rounded-full text-sm font-medium border transition-all",
              selectedFloor?.id === f.id
                ? "border-green-700 bg-green-700 text-white"
                : "border-gray-300 bg-white text-gray-600 hover:border-gray-400",
            ].join(" ")}
          >
            {f.display_name}
          </button>
        ))}
        <button
          onClick={() => navigate("/mapping/data-entry")}
          className="ml-auto px-4 py-1.5 rounded-full text-sm font-medium border border-gray-300 bg-white text-gray-600 hover:border-green-700 transition-all"
        >
          + Add Range
        </button>
      </div>

      {/* Range table */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : ranges.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500 mb-3">No ranges entered yet for this floor.</p>
          <button
            onClick={() => navigate("/mapping/data-entry")}
            className="text-sm px-4 py-2 rounded-lg text-white font-semibold"
            style={{ backgroundColor: "#1E4D2B" }}
          >
            Add First Range
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Range</th>
                <th className="px-4 py-3">Sides</th>
                <th className="px-4 py-3">Ladders</th>
                <th className="px-4 py-3">Shelves</th>
                <th className="px-4 py-3">Total Width</th>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {ranges.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50"}`}>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{r.range_number}</td>
                  <td className="px-4 py-3 text-gray-600">{r.side_count}</td>
                  <td className="px-4 py-3 text-gray-600">{r.ladder_count}</td>
                  <td className="px-4 py-3 text-gray-600">{r.shelf_count}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.total_width_inches != null ? `${r.total_width_inches}"` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.material_type ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-medium">
                        {r.material_type}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmDelete === r.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-500">Delete range {r.range_number}?</span>
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deleting === r.id}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          {deleting === r.id ? "Deleting…" : "Yes"}
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-400 hover:text-gray-600">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(r.id)}
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}