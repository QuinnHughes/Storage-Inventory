import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

const TYPE_LABEL = {
  no_record:        "No ILS Record",
  out_of_order:     "Out of Order",
  wrong_location:   "Wrong Location",
  status_issue:     "Status Issue",
  fulfillment_note: "Fulfillment Note",
  deleted_on_shelf: "Deleted on Shelf",
};

const TYPE_SEV = {
  no_record:        "error",
  out_of_order:     "warning",
  wrong_location:   "warning",
  status_issue:     "warning",
  fulfillment_note: "info",
  deleted_on_shelf: "error",
};

function timeAgo(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  const now = new Date();
  const days = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo. ago`;
  return `${Math.floor(days / 365)} yr. ago`;
}

function formatDate(isoStr) {
  if (!isoStr) return null;
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

export default function Overview() {
  const navigate = useNavigate();
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [selectedCode, setSelectedCode] = useState("__all__");

  useEffect(() => {
    api.getMorganOverview()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const activeStats =
    !data
      ? null
      : selectedCode === "__all__"
        ? data.summary
        : (data.locations.find((l) => l.code === selectedCode) ?? data.summary);

  const locName =
    !data || selectedCode === "__all__"
      ? null
      : data.locations.find((l) => l.code === selectedCode)?.display_name ?? selectedCode;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/morgan")}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Morgan Inventory
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>
          Inventory Overview
        </h1>
        <span className="ml-auto text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
          Morgan Library
        </span>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mb-4">{error}</p>
      )}

      {loading && (
        <div className="text-sm text-gray-400 py-16 text-center">Loading…</div>
      )}

      {!loading && data && (
        <>
          {/* Location filter tabs */}
          {data.locations.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-6">
              <TabPill
                active={selectedCode === "__all__"}
                onClick={() => setSelectedCode("__all__")}
                label="All Locations"
              />
              {data.locations.map((loc) => (
                <TabPill
                  key={loc.code}
                  active={selectedCode === loc.code}
                  onClick={() => setSelectedCode(loc.code)}
                  label={loc.code === "__uncategorized__" ? "Uncategorized" : loc.code}
                  title={loc.code !== "__uncategorized__" ? loc.display_name : undefined}
                />
              ))}
            </div>
          )}

          {/* Selected location name */}
          {locName && (
            <p className="text-sm text-gray-500 mb-4 -mt-2">{locName}</p>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-2">
            <StatCard
              label="Coverage"
              value={`${activeStats.shelves_done} / ${activeStats.shelves_total}`}
              sub={`${activeStats.coverage_pct}% complete`}
              color="green"
            />
            <StatCard
              label="Errors"
              value={activeStats.by_severity.error}
              sub="critical issues"
              color="red"
            />
            <StatCard
              label="Warnings"
              value={activeStats.by_severity.warning}
              sub="advisory issues"
              color="amber"
            />
            <StatCard
              label="Resolved"
              value={`${activeStats.discrepancies_resolved} / ${activeStats.discrepancies_total}`}
              sub={`${activeStats.resolution_pct}% resolved`}
              color="blue"
            />
            <StatCard
              label="Measured"
              value={`${activeStats.inches_measured}"`}
              sub="inches in sessions"
              color="gray"
            />
          </div>

          {/* Last inventoried / staleness */}
          <div className="mb-6 h-6 flex items-center gap-2 text-sm">
            {activeStats.last_inventoried ? (
              <>
                <span className="text-gray-400">Last inventoried:</span>
                <span className="font-medium text-gray-700">
                  {formatDate(activeStats.last_inventoried)}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-400 italic">
                  {timeAgo(activeStats.last_inventoried)}
                </span>
              </>
            ) : (
              <span className="text-gray-400 italic">No sessions recorded yet.</span>
            )}
          </div>

          {/* Discrepancy breakdown by type */}
          {activeStats.discrepancies_total > 0 && (
            <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-0">
              <h2 className="text-base font-semibold text-gray-800 mb-4">
                Discrepancies by Type
              </h2>
              <div className="divide-y divide-gray-100">
                {Object.entries(TYPE_LABEL).map(([type, label]) => {
                  const count = activeStats.by_type[type] ?? 0;
                  if (count === 0) return null;
                  const sev = TYPE_SEV[type] ?? "info";
                  return (
                    <div key={type} className="flex items-center gap-3 py-2.5">
                      <SevDot sev={sev} />
                      <span className="flex-1 text-sm text-gray-700">{label}</span>
                      <span className="text-sm font-semibold text-gray-800 tabular-nums">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Location breakdown table — all-locations view only */}
          {selectedCode === "__all__" && data.locations.length > 0 && (
            <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">By Location</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase text-left border-b border-gray-100">
                      <th className="pb-2 pr-4 font-medium">Location</th>
                      <th className="pb-2 px-4 font-medium text-right">Coverage</th>
                      <th className="pb-2 px-4 font-medium text-right">Errors</th>
                      <th className="pb-2 px-4 font-medium text-right">Warnings</th>
                      <th className="pb-2 px-4 font-medium text-right">Resolved</th>
                      <th className="pb-2 px-4 font-medium text-right">Inches</th>
                      <th className="pb-2 pl-4 font-medium text-right">Last Inventoried</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.locations.map((loc) => (
                      <tr
                        key={loc.code}
                        onClick={() => setSelectedCode(loc.code)}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-gray-800">
                            {loc.code === "__uncategorized__" ? "Uncategorized" : loc.code}
                          </div>
                          {loc.code !== "__uncategorized__" && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              {loc.display_name}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          <span className="font-medium text-gray-800">
                            {loc.shelves_done}/{loc.shelves_total}
                          </span>
                          <span className="text-gray-400 text-xs ml-1">
                            {loc.coverage_pct}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {loc.by_severity.error > 0 ? (
                            <span className="text-red-600 font-medium">
                              {loc.by_severity.error}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {loc.by_severity.warning > 0 ? (
                            <span className="text-amber-600 font-medium">
                              {loc.by_severity.warning}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-600">
                          {loc.discrepancies_total > 0 ? (
                            <>
                              {loc.discrepancies_resolved}/{loc.discrepancies_total}
                              <span className="text-gray-400 text-xs ml-1">
                                {loc.resolution_pct}%
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-gray-600">
                          {loc.inches_measured > 0 ? (
                            `${loc.inches_measured}"`
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-3 pl-4 text-right">
                          {loc.last_inventoried ? (
                            <div>
                              <div className="text-gray-700">
                                {formatDate(loc.last_inventoried)}
                              </div>
                              <div className="text-xs text-gray-400">
                                {timeAgo(loc.last_inventoried)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-300">Never</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state when no discrepancies and no locations */}
          {activeStats.discrepancies_total === 0 &&
            activeStats.shelves_total === 0 && (
              <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-12 text-center">
                <p className="text-gray-400 text-sm">
                  No mapping data or scan sessions found for Morgan Library.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Add floors and ranges in Mapping, then run Shelf Scanning to populate this page.
                </p>
              </div>
            )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabPill({ active, onClick, label, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
        active
          ? "bg-green-700 text-white border-green-700"
          : "bg-white text-gray-600 border-gray-300 hover:border-green-600 hover:text-green-700",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function StatCard({ label, value, sub, color }) {
  const valueColors = {
    green: "text-green-700",
    red:   "text-red-600",
    amber: "text-amber-600",
    blue:  "text-blue-600",
    gray:  "text-gray-700",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold leading-tight ${valueColors[color] ?? "text-gray-800"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  );
}

function SevDot({ sev }) {
  const colors = {
    error:   "bg-red-500",
    warning: "bg-amber-400",
    info:    "bg-blue-400",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[sev] ?? "bg-gray-300"}`}
    />
  );
}
