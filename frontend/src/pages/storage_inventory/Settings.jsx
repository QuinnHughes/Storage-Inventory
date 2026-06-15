import { useEffect, useState } from "react";
import { api } from "../../api/client";

// ── Resolution Options section ────────────────────────────────────────────────

function ResolutionOptions() {
  const [options, setOptions]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [name, setName]             = useState("");
  const [description, setDesc]      = useState("");
  const [saving, setSaving]         = useState(false);
  const [confirmDelete, setConfirm] = useState(null);
  const [error, setError]           = useState(null);

  const load = () => {
    setLoading(true);
    api.getResolutionOptions()
      .then(setOptions)
      .catch(() => setError("Failed to load options."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    setError(null);
    try {
      await api.createResolutionOption({ name: n, description: description.trim() || null, sort_order: options.length });
      setName("");
      setDesc("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteResolutionOption(id);
      setConfirm(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-1">Discrepancy Resolution Options</h2>
      <p className="text-xs text-gray-500 mb-5">
        Define the outcomes that can be recorded when a discrepancy is resolved. These appear as a
        dropdown on the Discrepancies tab of each scan session.
      </p>

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mb-5">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Option name (e.g. Reshelved)"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 w-56"
        />
        <input
          value={description}
          onChange={e => setDesc(e.target.value)}
          placeholder="Description (optional)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 flex-1 min-w-40"
        />
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
          style={{ backgroundColor: "#1E4D2B" }}
        >
          {saving ? "Adding…" : "Add Option"}
        </button>
      </form>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : options.length === 0 ? (
        <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <p className="text-sm">No options yet. Add your first resolution option above.</p>
          <p className="text-xs mt-1 text-gray-300">
            Suggested: Reshelved · Sent to Cataloging · Flagged for Review · Withdrawn · No Action Needed
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {options.map((opt, i) => (
                <tr key={opt.id} className={`border-t border-gray-100 ${i % 2 === 1 ? "bg-gray-50" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{opt.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {opt.description ?? <span className="italic text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {confirmDelete === opt.id ? (
                      <span className="inline-flex gap-1 items-center">
                        <span className="text-xs text-gray-500 mr-1">Delete?</span>
                        <button onClick={() => handleDelete(opt.id)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium">Yes</button>
                        <span className="text-gray-300">·</span>
                        <button onClick={() => setConfirm(null)}
                          className="text-xs text-gray-400 hover:text-gray-700">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirm(opt.id)}
                        className="text-xs text-gray-300 hover:text-red-500 transition-colors">
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold" style={{ color: "#1E4D2B" }}>Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure Storage Inventory options.
        </p>
      </div>

      <div className="space-y-6 max-w-3xl">
        <ResolutionOptions />
      </div>
    </div>
  );
}
