import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";

// ── Severity helpers ──────────────────────────────────────────────────────────
const SEV_COLOR = {
  error:   "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  info:    "bg-blue-100 text-blue-800 border-blue-200",
};
const SEV_DOT = {
  error:   "bg-red-500",
  warning: "bg-amber-400",
  info:    "bg-blue-400",
};
const TYPE_LABEL = {
  no_record:        "No ILS Record",
  out_of_order:     "Out of Order",
  wrong_location:   "Wrong Location",
  status_issue:     "Status Issue",
  fulfillment_note: "Fulfillment Note",
  deleted_on_shelf: "Deleted on Shelf",
};

// ── Sub-components ────────────────────────────────────────────────────────────
function DiscBadge({ disc }) {
  if (!disc) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border ${SEV_COLOR[disc.severity]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[disc.severity]}`} />
      {TYPE_LABEL[disc.type] ?? disc.type}
    </span>
  );
}

function ItemRow({ item, onRemove, readonly }) {
  const hasRecord = !!item.ils_record_id;
  return (
    <tr className={`border-b border-gray-100 ${!hasRecord ? "bg-red-50" : ""}`}>
      <td className="px-3 py-2 font-mono text-xs text-gray-400 text-right select-none w-10">
        {item.position}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-gray-700">{item.barcode}</td>
      <td className="px-3 py-2 text-sm text-gray-800 max-w-xs truncate">
        {item.title ?? <span className="text-gray-400 italic">Not found</span>}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.call_number}</td>
      <td className="px-3 py-2">
        {item.discrepancy ? <DiscBadge disc={item.discrepancy} /> : null}
      </td>
      {!readonly && (
        <td className="px-3 py-2 text-right">
          <button onClick={() => onRemove(item.position)}
            className="text-gray-300 hover:text-red-500 text-xs px-1">✕</button>
        </td>
      )}
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ScanSessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inputMode, setInputMode] = useState("live"); // live | upload
  const [barcode, setBarcode] = useState("");
  const [adding, setAdding] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [inches, setInches] = useState("");
  const [savingInches, setSavingInches] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [locationCode, setLocationCode] = useState(null); // null = auto
  const [activeTab, setActiveTab] = useState("items"); // items | discrepancies
  const [resolutionOptions, setResolutionOptions] = useState([]);
  const [editingDiscId, setEditingDiscId]         = useState(null);
  const [resolutionForm, setResolutionForm]       = useState({ option_id: "", notes: "" });
  const [savingResolution, setSavingResolution]   = useState(false);
  const [rescanning, setRescanning]               = useState(false);

  const inputRef = useRef();
  const fileRef = useRef();
  const bottomRef = useRef();

  const reload = useCallback(() => {
    api.getSession(id)
      .then(s => {
        setSession(s);
        setInches(s.inches_of_material != null ? String(s.inches_of_material) : "");
        // Auto-select the only location code on first load
        setLocationCode(prev => {
          if (prev !== null) return prev; // user already chose something
          const codes = s.location?.location_codes ?? [];
          return codes.length === 1 ? codes[0] : null;
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  // Load resolution options once
  useEffect(() => {
    api.getResolutionOptions().then(setResolutionOptions).catch(() => {});
  }, []);

  // Auto-focus input when in live mode
  useEffect(() => {
    if (inputMode === "live" && session?.status === "scanning") {
      inputRef.current?.focus();
    }
  }, [inputMode, session?.status]);

  // Scroll to bottom after new item added
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.items?.length]);

  // Re-focus barcode input after each add completes (adding goes false → re-render → input enabled)
  useEffect(() => {
    if (!adding && inputMode === "live" && session?.status === "scanning") {
      inputRef.current?.focus();
    }
  }, [adding]);

  const addBarcode = async (e) => {
    e?.preventDefault();
    const bc = barcode.trim();
    if (!bc) return;
    setAdding(true);
    try {
      await api.addScanItem(id, bc);
      setBarcode("");
      reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setAdding(false);
      inputRef.current?.focus();
    }
  };

  const removeItem = async (position) => {
    await api.removeScanItem(id, position);
    reload();
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const r = await api.uploadBarcodes(id, file);
      reload();
      alert(`Loaded ${r.loaded} barcodes.`);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const s = await api.analyzeSession(id, locationCode || null);
      setSession(s);
      setActiveTab("discrepancies");
    } catch (err) {
      setAnalyzeError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const saveInches = async () => {
    setSavingInches(true);
    try {
      await api.patchSession(id, { inches_of_material: parseFloat(inches) || null });
      reload();
    } finally {
      setSavingInches(false);
    }
  };

  const markComplete = async () => {
    await api.patchSession(id, { status: "complete" });
    reload();
  };

  const rescanShelf = async () => {
    setRescanning(true);
    try {
      const newSession = await api.createSession({ shelf_id: session.shelf_id });
      navigate(`/morgan/scanning/${newSession.id}`);
    } catch (e) {
      alert(e.message);
      setRescanning(false);
    }
  };

  const openEdit = (d) => {
    setResolutionForm({
      option_id: d.resolution_option_id ? String(d.resolution_option_id) : "",
      notes:     d.resolution_notes ?? "",
    });
    setEditingDiscId(d.id);
  };

  const saveResolution = async (discId) => {
    setSavingResolution(true);
    try {
      await api.resolveDiscrepancy(id, discId, {
        option_id: resolutionForm.option_id ? Number(resolutionForm.option_id) : null,
        notes:     resolutionForm.notes || null,
      });
      setEditingDiscId(null);
      reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingResolution(false);
    }
  };

  const clearResolution = async (discId) => {
    setSavingResolution(true);
    try {
      await api.resolveDiscrepancy(id, discId, { option_id: null, notes: null });
      setEditingDiscId(null);
      reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingResolution(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-400 py-10">Loading…</p>;
  if (!session) return <p className="text-sm text-red-500 py-10">Session not found.</p>;

  const isScanning   = session.status === "scanning";
  const canResolve   = session.status === "analyzed" || session.status === "complete";
  const resolvedCount = (session.discrepancies ?? []).filter(d => d.resolved_at).length;
  const discsByItemId = Object.fromEntries(
    (session.discrepancies ?? []).map(d => [d.scan_item_id, d])
  );
  const itemsWithDisc = (session.items ?? []).map(it => ({
    ...it,
    discrepancy: discsByItemId[it.id] ?? null,
  }));

  // Group discrepancies by type for the summary panel
  const discGroups = {};
  for (const d of session.discrepancies ?? []) {
    (discGroups[d.type] = discGroups[d.type] ?? []).push(d);
  }

  const errorCount   = (session.discrepancies ?? []).filter(d => d.severity === "error").length;
  const warningCount = (session.discrepancies ?? []).filter(d => d.severity === "warning").length;
  const infoCount    = (session.discrepancies ?? []).filter(d => d.severity === "info").length;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <button onClick={() => navigate("/morgan/scanning")}
            className="text-xs text-gray-400 hover:text-gray-700 mb-1">
            ← Back to scanning
          </button>
          {session.location ? (
            <>
              <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>
                Range {session.location.range_number} · Side {session.location.side_letter}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">{session.location.floor_display_name}</p>
            </>
          ) : (
            <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>
              {session.location_label || "Scan Session #" + session.id}
            </h1>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {session.item_count} items &nbsp;·&nbsp;
            {session.discrepancy_count} discrepancies &nbsp;·&nbsp;
            <span className="capitalize">{session.status}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {!isScanning && session.shelf_id != null && (
            <button onClick={rescanShelf} disabled={rescanning}
              className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-40">
              {rescanning ? "Starting…" : "Rescan Shelf"}
            </button>
          )}
          {session.status === "analyzed" && (
            <button onClick={markComplete}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: "#1E4D2B" }}>
              Mark Complete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── Left: item list ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Input controls — only while scanning */}
          {isScanning && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
              {/* Mode tabs */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                {["live", "upload"].map(m => (
                  <button key={m}
                    onClick={() => setInputMode(m)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inputMode === m ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}>
                    {m === "live" ? "🔫 Live Scan" : "📂 Upload File"}
                  </button>
                ))}
              </div>

              {inputMode === "live" ? (
                <form onSubmit={addBarcode} className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    placeholder="Scan or type barcode…"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
                    autoComplete="off"
                    disabled={adding}
                  />
                  <button type="submit" disabled={adding || !barcode.trim()}
                    className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
                    style={{ backgroundColor: "#1E4D2B" }}>
                    Add
                  </button>
                </form>
              ) : (
                <div>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden
                    onChange={e => handleFileUpload(e.target.files[0])} />
                  <button
                    onClick={() => fileRef.current.click()}
                    disabled={uploading}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                    {uploading ? "Uploading…" : "Choose file (.csv / .xlsx)"}
                  </button>
                  <p className="text-xs text-gray-400 mt-1">
                    File must have a <span className="font-mono">Barcode</span> column header; rows are the scanned barcodes in order.
                  </p>
                  {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Item table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-gray-200">
              {["items", "discrepancies"].map(t => (
                <button key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === t
                      ? "border-green-700 text-green-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}>
                  {t === "items"
                    ? `Items (${session.item_count})`
                    : `Discrepancies (${session.discrepancy_count})`}
                </button>
              ))}
            </div>

            {activeTab === "items" ? (
              session.items.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">
                  No items scanned yet.
                </p>
              ) : (
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-right w-10">#</th>
                        <th className="px-3 py-2 text-left">Barcode</th>
                        <th className="px-3 py-2 text-left">Title</th>
                        <th className="px-3 py-2 text-left">Call Number</th>
                        <th className="px-3 py-2 text-left">Issue</th>
                        {isScanning && <th className="px-3 py-2 w-8"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {itemsWithDisc.map(item => (
                        <ItemRow key={item.id} item={item}
                          onRemove={removeItem} readonly={!isScanning} />
                      ))}
                    </tbody>
                  </table>
                  <div ref={bottomRef} />
                </div>
              )
            ) : (
              /* Discrepancies tab */
              session.discrepancies.length === 0 ? (
                <p className="text-sm text-green-700 text-center py-10">
                  ✅ No discrepancies found.
                </p>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[60vh] overflow-auto">
                  {session.discrepancies.map(d => {
                    const item = session.items.find(it => it.id === d.scan_item_id);
                    const isEditing = editingDiscId === d.id;
                    return (
                      <div key={d.id} className={`px-4 py-3 ${
                        d.resolved_at ? "bg-green-50 opacity-75" :
                        d.severity === "error" ? "bg-red-50" :
                        d.severity === "warning" ? "bg-amber-50" : "bg-blue-50"
                      }`}>
                        <div className="flex gap-3 items-start">
                          <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                            d.resolved_at ? "bg-green-500" : SEV_DOT[d.severity]
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-700">
                              {TYPE_LABEL[d.type] ?? d.type}
                              {item && (
                                <span className="ml-2 font-mono text-gray-400 font-normal">
                                  pos {item.position} · {item.barcode}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">{d.detail}</p>

                            {/* Resolved badge */}
                            {d.resolved_at && !isEditing && (
                              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                <span className="text-green-700 text-xs">✓</span>
                                <span className="text-xs font-medium text-green-700">{d.resolution_option_name}</span>
                                <span className="text-xs text-gray-400">
                                  {new Date(d.resolved_at).toLocaleString()}
                                </span>
                                {d.resolution_notes && (
                                  <span className="text-xs text-gray-500 italic">{d.resolution_notes}</span>
                                )}
                                {canResolve && (
                                  <button onClick={() => openEdit(d)}
                                    className="text-xs text-gray-400 hover:text-gray-700 underline ml-1">
                                    Edit
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Resolve button (unresolved) */}
                            {canResolve && !d.resolved_at && !isEditing && (
                              <button onClick={() => openEdit(d)}
                                className="mt-1.5 text-xs text-gray-400 hover:text-green-700 transition-colors">
                                + Resolve
                              </button>
                            )}

                            {/* Inline resolution form */}
                            {isEditing && (
                              <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
                                <select
                                  value={resolutionForm.option_id}
                                  onChange={e => setResolutionForm(f => ({ ...f, option_id: e.target.value }))}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-700"
                                >
                                  <option value="">— Select outcome —</option>
                                  {resolutionOptions.map(opt => (
                                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                                  ))}
                                </select>
                                <textarea
                                  rows={2}
                                  value={resolutionForm.notes}
                                  onChange={e => setResolutionForm(f => ({ ...f, notes: e.target.value }))}
                                  placeholder="Notes (optional)…"
                                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-green-700"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveResolution(d.id)}
                                    disabled={!resolutionForm.option_id || savingResolution}
                                    className="px-3 py-1 text-xs font-medium text-white rounded-lg disabled:opacity-40"
                                    style={{ backgroundColor: "#1E4D2B" }}>
                                    {savingResolution ? "Saving…" : "Save"}
                                  </button>
                                  {d.resolved_at && (
                                    <button
                                      onClick={() => clearResolution(d.id)}
                                      disabled={savingResolution}
                                      className="px-3 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40">
                                      Clear
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setEditingDiscId(null)}
                                    className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>

        {/* ── Right: controls & summary ── */}
        <div className="space-y-4">
          {/* Analyse */}
          {isScanning && session.item_count > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Analyse Shelf</h3>
              {/* Location code selector */}
              {session.location?.location_codes?.length > 0 ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Expected location code
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {session.location.location_codes.map(code => (
                      <button key={code}
                        onClick={() => setLocationCode(locationCode === code ? null : code)}
                        className={`px-3 py-1 rounded-full text-xs border font-mono transition-colors ${
                          locationCode === code
                            ? "bg-green-700 text-white border-green-700"
                            : "bg-white text-gray-600 border-gray-300 hover:border-green-600 hover:text-green-800"
                        }`}>
                        {code}
                      </button>
                    ))}
                    {locationCode && (
                      <button onClick={() => setLocationCode(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Expected location code <span className="text-gray-400">(optional, for wrong-location checks)</span>
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
                    placeholder="e.g. ms, msu, ssy"
                    value={locationCode ?? ""}
                    onChange={e => setLocationCode(e.target.value || null)}
                  />
                </div>
              )}
              {analyzeError && <p className="text-xs text-red-600">{analyzeError}</p>}
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="w-full py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
                style={{ backgroundColor: "#1E4D2B" }}>
                {analyzing ? "Analysing…" : "Run Analysis"}
              </button>
            </div>
          )}

          {/* Re-analyse button when already analysed */}
          {session.status === "analyzed" && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Re-analyse</h3>
              {analyzeError && <p className="text-xs text-red-600">{analyzeError}</p>}
              <button onClick={runAnalysis} disabled={analyzing}
                className="w-full py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                {analyzing ? "Analysing…" : "Run Again"}
              </button>
            </div>
          )}

          {/* Discrepancy summary */}
          {session.discrepancy_count > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Summary</h3>
              <div className="space-y-1.5">
                {errorCount   > 0 && <SummaryRow color="red"    label="Errors"   count={errorCount} />}
                {warningCount > 0 && <SummaryRow color="amber"  label="Warnings" count={warningCount} />}
                {infoCount    > 0 && <SummaryRow color="blue"   label="Info"     count={infoCount} />}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                {Object.entries(discGroups).map(([type, items]) => (
                  <div key={type} className="flex justify-between text-xs text-gray-600">
                    <span>{TYPE_LABEL[type] ?? type}</span>
                    <span className="font-mono font-medium">{items.length}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs">
                <span className="text-gray-500">Resolved</span>
                <span className={`font-mono font-medium ${
                  resolvedCount === session.discrepancy_count ? "text-green-700" : "text-gray-700"
                }`}>
                  {resolvedCount} / {session.discrepancy_count}
                </span>
              </div>
            </div>
          )}

          {/* Shelf measurement */}
          {session.status !== "scanning" && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Shelf Measurement</h3>
              <div className="flex gap-2">
                <input
                  type="number" min="0" step="0.25"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  placeholder="Inches of material"
                  value={inches}
                  onChange={e => setInches(e.target.value)}
                />
                <button onClick={saveInches} disabled={savingInches}
                  className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                  {savingInches ? "…" : "Save"}
                </button>
              </div>
              {session.inches_of_material != null && (
                <p className="text-xs text-gray-500">
                  Saved: <span className="font-mono font-medium">{session.inches_of_material}"</span>
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <NoteEditor sessionId={id} initialNotes={session.notes} onSaved={reload} />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ color, label, count }) {
  const colors = {
    red:   "bg-red-500",
    amber: "bg-amber-400",
    blue:  "bg-blue-400",
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${colors[color]}`} />
      <span className="text-gray-600">{label}</span>
      <span className="ml-auto font-mono font-medium text-gray-800">{count}</span>
    </div>
  );
}

function NoteEditor({ sessionId, initialNotes, onSaved }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => setNotes(initialNotes ?? ""), [initialNotes]);

  const save = async () => {
    setSaving(true);
    try { await api.patchSession(sessionId, { notes }); onSaved(); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">Notes</h3>
      <textarea
        rows={4}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
        placeholder="Any notes about this shelf…"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <button onClick={save} disabled={saving}
        className="text-xs font-medium px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
        {saving ? "Saving…" : "Save Notes"}
      </button>
    </div>
  );
}
