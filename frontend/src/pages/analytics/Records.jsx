import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";

const PER_PAGE_OPTIONS = [25, 50, 100];

const ALL_FIELDS = [
  { key: "title",            label: "Title" },
  { key: "call_number",      label: "Call Number" },
  { key: "item_call_number", label: "Item Call Number" },
  { key: "item_policy",      label: "Item Policy" },
  { key: "description",      label: "Description" },
  { key: "author",           label: "Author" },
  { key: "status",           label: "Status" },
  { key: "lifecycle",        label: "Lifecycle" },
  { key: "location_code",    label: "Location Code" },
  { key: "location_name",    label: "Location Name" },
  { key: "fulfillment_note", label: "Fulfillment Note" },
];

export default function Records() {
  // Filter state
  const [q, setQ] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [status, setStatus] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  // Data state
  const [meta, setMeta] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Edit modal
  const [editing, setEditing] = useState(null); // record object | null
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const searchTimeout = useRef(null);

  // Load filter metadata once
  useEffect(() => {
    api.getAnalyticsMeta()
      .then(setMeta)
      .catch(() => {});
  }, []);

  const fetchRecords = useCallback(() => {
    setLoading(true);
    setError(null);
    api.searchRecords({
      q,
      location_code: locationCode,
      collection_id: collectionId || undefined,
      status,
      lifecycle,
      hide_deleted: !showDeleted,
      page,
      per_page: perPage,
    })
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q, locationCode, collectionId, status, lifecycle, showDeleted, page, perPage]);

  // Debounce keyword search, immediate on filter changes
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(fetchRecords, q ? 300 : 0);
    return () => clearTimeout(searchTimeout.current);
  }, [fetchRecords]);

  const resetFilters = () => {
    setQ(""); setLocationCode(""); setCollectionId("");
    setStatus(""); setLifecycle(""); setShowDeleted(false); setPage(1);
  };

  const openEdit = (rec) => {
    setEditing(rec);
    setEditForm({
      title: rec.title ?? "",
      call_number: rec.call_number ?? "",
      item_call_number: rec.item_call_number ?? "",
      item_policy: rec.item_policy ?? "",
      description: rec.description ?? "",
      author: rec.author ?? "",
      status: rec.status ?? "",
      lifecycle: rec.lifecycle ?? "",
      location_code: rec.location_code ?? "",
      location_name: rec.location_name ?? "",
      fulfillment_note: rec.fulfillment_note ?? "",
    });
    setSaveError(null);
    setConfirmDelete(false);
  };

  const closeEdit = () => { setEditing(null); setConfirmDelete(false); };

  const setF = (key) => (e) => setEditForm((p) => ({ ...p, [key]: e.target.value }));

  const saveEdit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateRecord(editing.id, editForm);
      closeEdit();
      fetchRecords();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setSaving(true);
    try {
      await api.deleteRecord(editing.id);
      closeEdit();
      fetchRecords();
    } catch (e) {
      setSaveError(e.message);
      setSaving(false);
    }
  };

  const totalPages = result ? Math.ceil(result.total / perPage) : 1;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2" style={{ color: "#1E4D2B" }}>Records</h1>
      <p className="text-base text-gray-500 mb-6">
        Search and edit every imported ILS record.
        {result && <span className="ml-2 text-gray-400 text-sm">{result.total.toLocaleString()} total</span>}
      </p>

      {/* ── Filter bar ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-5 space-y-3">
        <div className="flex gap-3 flex-wrap">
          <input
            className="flex-1 min-w-52 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ "--tw-ring-color": "#1E4D2B" }}
            placeholder="Search barcode, title, call number, author…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
          <Select
            value={collectionId}
            onChange={(v) => { setCollectionId(v); setPage(1); }}
            placeholder="All collections"
            options={(meta?.collections ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
          />
          <Select
            value={locationCode}
            onChange={(v) => { setLocationCode(v); setPage(1); }}
            placeholder="All locations"
            options={(meta?.location_codes ?? []).map((c) => ({ value: c, label: c }))}
          />
          <Select
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            placeholder="Any status"
            options={(meta?.statuses ?? []).map((s) => ({ value: s, label: s }))}
          />
          <Select
            value={lifecycle}
            onChange={(v) => { setLifecycle(v); setPage(1); }}
            placeholder="Any lifecycle"
            options={(meta?.lifecycles ?? []).map((l) => ({ value: l, label: l }))}
          />
          {(q || locationCode || collectionId || status || lifecycle || showDeleted) && (
            <button
              onClick={resetFilters}
              className="text-sm text-gray-400 hover:text-gray-700 px-2"
            >✕ Clear</button>
          )}
        </div>
        {/* Show deleted toggle */}
        <div className="flex items-center gap-2">
          <input
            id="show-deleted"
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => { setShowDeleted(e.target.checked); setPage(1); }}
            className="h-4 w-4 rounded border-gray-300 cursor-pointer"
            style={{ accentColor: "#1E4D2B" }}
          />
          <label htmlFor="show-deleted" className="text-sm text-gray-500 cursor-pointer select-none">
            Show deleted items
          </label>
        </div>
      </div>

      {/* ── Results table ── */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <tr>
              <Th>Barcode</Th>
              <Th>Title</Th>
              <Th>Call Number</Th>
              <Th>Location</Th>
              <Th>Status</Th>
              <Th>Lifecycle</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">Loading…</td></tr>
            )}
            {!loading && result?.items.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No records found.</td></tr>
            )}
            {!loading && result?.items.map((rec) => (
              <tr
                key={rec.id}
                className="hover:bg-green-50 cursor-pointer transition-colors"
                onClick={() => openEdit(rec)}
              >
                <Td><span className="font-mono text-xs">{rec.barcode}</span></Td>
                <Td><span className="line-clamp-1 max-w-xs">{rec.title ?? <span className="text-gray-300">—</span>}</span></Td>
                <Td><span className="font-mono text-xs">{rec.call_number ?? <span className="text-gray-300">—</span>}</span></Td>
                <Td><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">{rec.location_code ?? "—"}</span></Td>
                <Td>
                  <StatusBadge status={rec.status} />
                </Td>
                <Td>{rec.lifecycle ?? <span className="text-gray-300">—</span>}</Td>
                <Td>
                  <button
                    className="text-xs text-gray-400 hover:text-green-700 px-2 py-1 rounded hover:bg-green-50"
                    onClick={(e) => { e.stopPropagation(); openEdit(rec); }}
                  >Edit</button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {result && result.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="border border-gray-300 rounded px-2 py-0.5 text-sm bg-white"
              >
                {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span>Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-white"
              >‹</button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-white"
              >›</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit modal ── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Edit Record</h2>
                <p className="text-xs font-mono text-gray-400 mt-0.5">{editing.barcode}</p>
              </div>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Title full width */}
              <EditField label="Title" value={editForm.title} onChange={setF("title")} />

              <div className="grid grid-cols-2 gap-4">
                <EditField label="Call Number" value={editForm.call_number} onChange={setF("call_number")} mono />
                <EditField label="Item Call Number" value={editForm.item_call_number} onChange={setF("item_call_number")} mono />
                <EditField label="Item Policy" value={editForm.item_policy} onChange={setF("item_policy")} />
                <EditField label="Author" value={editForm.author} onChange={setF("author")} />
                <EditField label="Status" value={editForm.status} onChange={setF("status")} />
                <EditField label="Lifecycle" value={editForm.lifecycle} onChange={setF("lifecycle")} />
                <EditField label="Location Code" value={editForm.location_code} onChange={setF("location_code")} mono />
                <EditField label="Location Name" value={editForm.location_name} onChange={setF("location_name")} />
              </div>

              <EditField label="Description" value={editForm.description} onChange={setF("description")} />
              <EditField label="Fulfillment Note" value={editForm.fulfillment_note} onChange={setF("fulfillment_note")} />
            </div>

            {saveError && (
              <p className="mx-6 mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{saveError}</p>
            )}

            <div className="flex items-center justify-between px-6 pb-6 pt-2">
              <div>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-red-400 hover:text-red-600 px-3 py-1.5 rounded hover:bg-red-50"
                  >Delete record</button>
                ) : (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-red-600 font-medium">Are you sure?</span>
                    <button onClick={doDelete} disabled={saving} className="text-red-600 font-semibold hover:underline disabled:opacity-40">Yes, delete</button>
                    <button onClick={() => setConfirmDelete(false)} className="text-gray-500 hover:underline">Cancel</button>
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={closeEdit} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold rounded text-white disabled:opacity-40 transition-colors"
                  style={{ background: "#1E4D2B" }}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Th({ children }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}

function Td({ children }) {
  return <td className="px-4 py-3 text-gray-700">{children}</td>;
}

function Select({ value, onChange, placeholder, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2"
      style={{ "--tw-ring-color": "#1E4D2B" }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function StatusBadge({ status }) {
  if (!status) return <span className="text-gray-300">—</span>;
  const ok = status.toLowerCase().includes("in place");
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
      {status}
    </span>
  );
}

function EditField({ label, value, onChange, mono = false }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input
        value={value}
        onChange={onChange}
        className={`border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${mono ? "font-mono" : ""}`}
        style={{ "--tw-ring-color": "#1E4D2B" }}
      />
    </div>
  );
}
