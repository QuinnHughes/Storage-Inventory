import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function Locations() {
  const navigate = useNavigate();
  const [locations, setLocations]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [newCode, setNewCode]       = useState("");
  const [newName, setNewName]       = useState("");
  const [saving, setSaving]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting]     = useState(null);

  const load = () => {
    setLoading(true);
    api.getLocations("morgan")
      .then(setLocations)
      .catch(() => setError("Could not load locations."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const code = newCode.trim().toLowerCase();
    const name = newName.trim();
    if (!code || !name) { setError("Both code and display name are required."); return; }
    setSaving(true);
    setError("");
    try {
      await api.createLocation({ code, display_name: name, facility: "morgan" });
      setNewCode("");
      setNewName("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await api.deleteLocation(id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/mapping")} className="text-sm text-gray-400 hover:text-gray-600">
          ← Mapping
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>Morgan Locations</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Location codes associated with Morgan Library in Alma. These appear as selectable options
        when entering a range, since physical ranges often hold items from more than one location.
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Add form */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Location Code</h2>
        <form onSubmit={handleAdd} className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Code</label>
            <input
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-green-700"
              placeholder="e.g. msx"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Display Name</label>
            <input
              className="w-52 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
              placeholder="e.g. Special Collections"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "#1E4D2B" }}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </form>
      </div>

      {/* Location list */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 px-5 py-6">Loading…</p>
        ) : locations.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-6">No locations defined yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Display Name</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc, i) => (
                <tr key={loc.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50"}`}>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{loc.code}</td>
                  <td className="px-4 py-3 text-gray-600">{loc.display_name}</td>
                  <td className="px-4 py-3 text-right">
                    {confirmDelete === loc.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-500">Remove {loc.code}?</span>
                        <button
                          onClick={() => handleDelete(loc.id)}
                          disabled={deleting === loc.id}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          {deleting === loc.id ? "Removing…" : "Yes"}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(loc.id)}
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
