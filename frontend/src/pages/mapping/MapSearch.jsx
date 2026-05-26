import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function MapSearch() {
  const navigate = useNavigate();
  const [prefix, setPrefix] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!prefix.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await api.searchMap(prefix.trim());
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/mapping")} className="text-sm text-gray-400 hover:text-gray-600">
          ← Mapping
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>Search</h1>
      </div>

      <p className="text-sm text-gray-500 mb-5">
        Enter any call number prefix to look up that location's structure and totals.
        Partial prefixes work — try <code className="bg-gray-100 px-1 rounded">S-1</code>,{" "}
        <code className="bg-gray-100 px-1 rounded">S-1-15B</code>, or{" "}
        <code className="bg-gray-100 px-1 rounded">S-1-15B-03</code>.
      </p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="e.g. S-1-15B-03"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-700"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: "#1E4D2B" }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mb-4">{error}</p>}

      {result && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          {/* Floor */}
          {result.floor && (
            <ResultRow label="Floor" value={result.floor.display_name} />
          )}

          {/* Range details */}
          {result.range && (
            <>
              <ResultRow label="Range" value={result.range.range_number} />
              {result.range.material_type && (
                <ResultRow
                  label="Material type"
                  value={
                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-medium">
                      {result.range.material_type}
                    </span>
                  }
                />
              )}
              <ResultRow label="Sides" value={result.range.sides.map((s) => s.side_letter).join(", ")} />
            </>
          )}

          {/* Aggregated counts */}
          {result.ladder_count > 0 && (
            <ResultRow label="Ladders" value={result.ladder_count} />
          )}
          {result.shelf_count > 0 && (
            <ResultRow label="Shelves" value={result.shelf_count} />
          )}
          {result.total_width_inches != null && (
            <ResultRow label="Total shelf width" value={`${result.total_width_inches}"`} />
          )}

          {/* Drill-down side list when range returned but no side specified */}
          {result.range && !prefix.match(/[A-Da-d]/) && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Sides in this range:</p>
              <div className="flex gap-2 flex-wrap">
                {result.range.sides.map((side) => (
                  <button
                    key={side.id}
                    onClick={() => {
                      const newPrefix = `${prefix.replace(/\/$/, "")}-${side.side_letter}`.toUpperCase();
                      // normalize to S- format
                      setPrefix(newPrefix.startsWith("S-") ? newPrefix : `S-${newPrefix}`);
                    }}
                    className="text-xs px-3 py-1 rounded border border-gray-300 hover:border-green-700 transition-all"
                  >
                    Side {side.side_letter} ({side.ladders.length} ladders)
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-sm text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}