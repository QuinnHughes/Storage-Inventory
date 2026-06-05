import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoStr) {
  if (!isoStr) return "Never";
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function pctBar(pct) {
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${pct}%`,
          backgroundColor: pct === 100 ? "#1E4D2B" : "#6EBF8B",
        }}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "green" }) {
  const colors = {
    green: "text-green-700", red: "text-red-600",
    amber: "text-amber-600", gray: "text-gray-700", blue: "text-blue-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold leading-tight ${colors[color]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function FacilityCard({ title, subtitle, to, data, loading }) {
  const navigate = useNavigate();
  const s = data?.summary;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-800">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <button
          onClick={() => navigate(to)}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-green-700 hover:text-green-700 transition-colors"
        >
          View
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-300">Loading…</p>
      ) : !s ? (
        <p className="text-sm text-gray-300">No data available.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <div className="text-xs text-gray-400">Coverage</div>
              <div className="text-lg font-bold text-green-700">
                {s.shelves_done} / {s.shelves_total}
              </div>
              <div className="text-xs text-gray-400">{s.coverage_pct}%</div>
              {pctBar(s.coverage_pct)}
            </div>
            <div>
              <div className="text-xs text-gray-400">Discrepancies</div>
              <div className={`text-lg font-bold ${s.discrepancies_total > 0 ? "text-amber-600" : "text-green-700"}`}>
                {s.discrepancies_total}
              </div>
              <div className="text-xs text-gray-400">
                {s.discrepancies_resolved} resolved
              </div>
              {s.discrepancies_total > 0 && pctBar(s.resolution_pct)}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs text-gray-400">
            <span>Last inventoried</span>
            <span className="font-medium text-gray-600">{formatDate(s.last_inventoried)}</span>
          </div>

          {(s.by_severity?.error > 0 || s.by_severity?.warning > 0) && (
            <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
              {s.by_severity.error > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                  {s.by_severity.error} error{s.by_severity.error !== 1 ? "s" : ""}
                </span>
              )}
              {s.by_severity.warning > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  {s.by_severity.warning} warning{s.by_severity.warning !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QuickLink({ label, desc, to }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="text-left w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 hover:border-green-700 transition-colors group"
    >
      <div className="text-sm font-semibold text-gray-700 group-hover:text-green-800">{label}</div>
      <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [morgan, setMorgan]           = useState(null);
  const [storage, setStorage]         = useState(null);
  const [analyticsMeta, setMeta]      = useState(null);
  const [loadingMorgan, setLM]        = useState(true);
  const [loadingStorage, setLS]       = useState(true);
  const [loadingMeta, setLMeta]       = useState(true);

  useEffect(() => {
    api.getMorganOverview()
      .then(setMorgan).catch(() => {}).finally(() => setLM(false));
    api.getStorageOverview()
      .then(setStorage).catch(() => {}).finally(() => setLS(false));
    api.getAnalyticsMeta()
      .then(setMeta).catch(() => {}).finally(() => setLMeta(false));
  }, []);

  const totalIlsRecords = analyticsMeta?.total_records ?? null;

  return (
    <div className="max-w">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: "#1E4D2B" }}>Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Overview of inventory activity across both facilities.</p>
      </div>

      {/* Top stat bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Morgan Shelves"
          value={loadingMorgan ? "—" : `${morgan?.summary?.shelves_done ?? 0} / ${morgan?.summary?.shelves_total ?? 0}`}
          sub={loadingMorgan ? "" : `${morgan?.summary?.coverage_pct ?? 0}% scanned`}
          color="green"
        />
        <StatCard
          label="Storage Shelves"
          value={loadingStorage ? "—" : `${storage?.summary?.shelves_done ?? 0} / ${storage?.summary?.shelves_total ?? 0}`}
          sub={loadingStorage ? "" : `${storage?.summary?.coverage_pct ?? 0}% scanned`}
          color="green"
        />
        <StatCard
          label="Open Discrepancies"
          value={
            loadingMorgan || loadingStorage ? "—"
            : (morgan?.summary?.discrepancies_total ?? 0)
              - (morgan?.summary?.discrepancies_resolved ?? 0)
              + (storage?.summary?.discrepancies_total ?? 0)
              - (storage?.summary?.discrepancies_resolved ?? 0)
          }
          sub="across both facilities"
          color="amber"
        />
        <StatCard
          label="ILS Records"
          value={loadingMeta ? "—" : (totalIlsRecords?.toLocaleString() ?? "—")}
          sub="in analytics database"
          color="gray"
        />
      </div>

      {/* Facility cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
        <FacilityCard
          title="Morgan Inventory"
          subtitle="Morgan Library shelf scanning"
          to="/morgan"
          data={morgan}
          loading={loadingMorgan}
        />
        <FacilityCard
          title="Storage Inventory"
          subtitle="Storage facility shelf scanning"
          to="/storage"
          data={storage}
          loading={loadingStorage}
        />
      </div>

      {/* Quick links */}
      <div className="mb-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickLink to="/morgan/scanning"   label="Morgan Scanning"    desc="Start or resume a shelf scan" />
          <QuickLink to="/storage/scanning"  label="Storage Scanning"   desc="Start or resume a shelf scan" />
          <QuickLink to="/morgan/overview"   label="Morgan Overview"    desc="Coverage and discrepancy stats" />
          <QuickLink to="/storage/overview"  label="Storage Overview"   desc="Coverage and discrepancy stats" />
          <QuickLink to="/analytics/records" label="ILS Records"        desc="Search the analytics record set" />
          <QuickLink to="/mapping"           label="Mapping"            desc="Floors, ranges, and shelf layout" />
        </div>
      </div>
    </div>
  );
}

