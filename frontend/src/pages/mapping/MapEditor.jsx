/**
 * MapEditor â€” interactive top-down floor plan editor.
 *
 * Layout:  [Piece Library 220px] | [SVG Canvas flex] | [Properties 260px]
 *
 * Features:
 *  - Savable piece templates (name, category, width Ã— depth in inches)
 *  - Place templates onto the canvas with one click
 *  - Drag to move; drag bottom-right handle to resize
 *  - Snap to 10px grid
 *  - Edge snap: while dragging, auto-aligns to adjacent shapes when within 18px
 *  - Shift-click for multi-select
 *  - Group selected pieces â†’ assign to a DB range + choose which end is ladder 01
 *  - Grouped shapes move together; shown with a dashed group outline + ladder-01 arrow
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const GRID = 10;
const MIN_W = 20;
const MIN_H = 16;
const CANVAS_W = 1400;
const CANVAS_H = 900;
const HANDLE = 10;
const PPI = 2;            // pixels per inch â€” 1" = 2px on canvas
const SNAP_THRESH = 18;   // edge-snap threshold in px

const MAT_FILL = {
  "general stacks":    "#d1fae5",
  "microfilm":         "#dbeafe",
  "microfiche":        "#ede9fe",
  "oversize":          "#fef9c3",
  "special collections":"#fce7f3",
  "elec media":        "#ffedd5",
  "documents":         "#f1f5f9",
};
const MAT_STROKE = {
  "general stacks":    "#6ee7b7",
  "microfilm":         "#93c5fd",
  "microfiche":        "#c4b5fd",
  "oversize":          "#fde047",
  "special collections":"#f9a8d4",
  "elec media":        "#fdba74",
  "documents":         "#cbd5e1",
};
const DEFAULT_FILL   = "#e5e7eb";
const DEFAULT_STROKE = "#9ca3af";

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const snap = (v) => Math.round(v / GRID) * GRID;

function shapeColors(shape, ranges) {
  if (shape.color) return [shape.color, shape.color];
  const r = ranges.find((rng) => rng.id === shape.range_id);
  if (r?.material_type) return [MAT_FILL[r.material_type] || DEFAULT_FILL, MAT_STROKE[r.material_type] || DEFAULT_STROKE];
  return [DEFAULT_FILL, DEFAULT_STROKE];
}

function shapeLabel(shape, ranges) {
  if (shape.label) return shape.label;
  const r = ranges.find((rng) => rng.id === shape.range_id);
  return r ? `R${r.range_number}` : "?";
}

/** Edge-snap: returns adjusted {x,y} when dragging shape is within SNAP_THRESH of another's edge. */
function edgeSnap(x, y, w, h, others, excludeId) {
  let bestX = null, bestY = null, minX = SNAP_THRESH, minY = SNAP_THRESH;
  for (const o of others) {
    if (o.id === excludeId) continue;
    const yOverlap = !(y + h <= o.y || y >= o.y + o.height);
    const xOverlap = !(x + w <= o.x || x >= o.x + o.width);

    if (yOverlap) {
      const candidates = [
        [Math.abs(x - (o.x + o.width)), o.x + o.width],            // my left â†’ their right
        [Math.abs(x + w - o.x),         o.x - w],                   // my right â†’ their left
        [Math.abs(x - o.x),             o.x],                        // align left edges
        [Math.abs(x + w - (o.x + o.width)), o.x + o.width - w],     // align right edges
      ];
      for (const [d, v] of candidates) if (d < minX) { minX = d; bestX = v; }
    }
    if (xOverlap) {
      const candidates = [
        [Math.abs(y - (o.y + o.height)), o.y + o.height],
        [Math.abs(y + h - o.y),          o.y - h],
        [Math.abs(y - o.y),              o.y],
        [Math.abs(y + h - (o.y + o.height)), o.y + o.height - h],
      ];
      for (const [d, v] of candidates) if (d < minY) { minY = d; bestY = v; }
    }
  }
  return { x: bestX !== null ? bestX : x, y: bestY !== null ? bestY : y };
}

/** Bounding box for an array of shapes. */
function bbox(shapeList) {
  if (!shapeList.length) return null;
  const xs = shapeList.map((s) => s.x);
  const ys = shapeList.map((s) => s.y);
  const x2 = shapeList.map((s) => s.x + s.width);
  const y2 = shapeList.map((s) => s.y + s.height);
  return { x: Math.min(...xs), y: Math.min(...ys), x2: Math.max(...x2), y2: Math.max(...y2) };
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function MapEditor() {
  const navigate = useNavigate();

  // â€” Data â€”
  const [floors, setFloors] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [ranges, setRanges] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);

  // â€” UI state â€”
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());   // multi-select
  const [dragging, setDragging] = useState(null);

  // New piece template form (null = hidden)
  const [newPiece, setNewPiece] = useState(null);
  const [piecesSaving, setPiecesSaving] = useState(false);

  // Group-creation form state (shown in right panel)
  const [groupForm, setGroupForm] = useState({ range_id: "", ladder01_end: "left", label: "" });
  const [grouping, setGrouping] = useState(false);

  const svgRef = useRef(null);  const bgRef = useRef(null);
  const panRef = useRef(null);
  const shapesRef = useRef([]);
  const selectedIdsRef = useRef(new Set());

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  // â€” Derived â€”
  const selectedShapes = shapes.filter((s) => selectedIds.has(s.id));
  const isSingle = selectedIds.size === 1;
  const firstSelected = isSingle ? selectedShapes[0] : null;

  // Are all selected shapes in the same group?
  const sharedGroupId = (() => {
    if (selectedIds.size === 0) return null;
    const ids = [...selectedIds];
    const gid = shapes.find((s) => s.id === ids[0])?.group_id;
    if (!gid) return null;
    return ids.every((id) => shapes.find((s) => s.id === id)?.group_id === gid) ? gid : null;
  })();
  const sharedGroup = sharedGroupId ? groups.find((g) => g.id === sharedGroupId) : null;

  const rightPanelMode =
    selectedIds.size === 0      ? "none"
    : isSingle && !sharedGroup  ? "shape"
    : sharedGroup               ? "group"
    :                             "multi";
  // â€" Keep refs in sync for keyboard handler â€"
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  // â€” Load on mount â€”
  useEffect(() => {
    api.getFloors().then((fs) => {
      setFloors(fs);
      if (fs.length > 0) loadFloor(fs[0]);
    }).catch(() => setError("Could not load floors."));
    api.getTemplates().then(setTemplates).catch(() => {});
  }, []);

  // â€” Floor switching â€”
  const loadFloor = async (floor) => {
    setSelectedFloor(floor);
    setSelectedIds(new Set());
    setLoading(true);
    try {
      const [r, s, g] = await Promise.all([
        api.getRanges(floor.id),
        api.getShapes(floor.id),
        api.getGroups(floor.id),
      ]);
      setRanges(r);
      setShapes(s.map(normShape));
      setGroups(g);
    } catch { setError("Could not load floor data."); }
    finally { setLoading(false); }
  };

  const normShape = (s) => ({
    ...s,
    x:      parseFloat(s.x),
    y:      parseFloat(s.y),
    width:  parseFloat(s.width),
    height: parseFloat(s.height),
  });

  // â€” Place a template onto the canvas â€”
  const placeTemplate = async (tpl) => {
    if (!selectedFloor) return;
    const offset = (shapes.length % 12) * GRID * 2;
    const newShape = {
      template_id: tpl.id,
      label:  null,
      x:      40 + offset,
      y:      40 + offset,
      width:  snap(parseFloat(tpl.width_inches) * PPI),
      height: snap(parseFloat(tpl.depth_inches) * PPI),
      color:  tpl.color || null,
      rotation: 0,
    };
    try {
      const saved = await api.createShape(selectedFloor.id, newShape);
      const norm = normShape(saved);
      setShapes((prev) => [...prev, norm]);
      setSelectedIds(new Set([norm.id]));
    } catch (e) { setError(e.message); }
  };

  // â€” Add blank shape â€”
  const addBlankShape = async () => {
    if (!selectedFloor) return;
    const offset = (shapes.length % 12) * GRID * 2;
    const newShape = { label: "New", x: 40 + offset, y: 40 + offset, width: 80, height: 48, color: null, rotation: 0 };
    try {
      const saved = await api.createShape(selectedFloor.id, newShape);
      const norm = normShape(saved);
      setShapes((prev) => [...prev, norm]);
      setSelectedIds(new Set([norm.id]));
    } catch (e) { setError(e.message); }
  };

  // â€” Delete selected shapes â€”
  const deleteSelected = async () => {
    for (const id of selectedIds) {
      try { await api.deleteShape(id); } catch { /* ignore */ }
    }
    setShapes((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
  };

  // â€” Update a single field on the selected (single) shape â€”
  const patchShape = async (field, value) => {
    if (!firstSelected) return;
    const v = value === "" ? null : value;
    setShapes((prev) => prev.map((s) => s.id === firstSelected.id ? { ...s, [field]: v } : s));
    setSaving(true);
    try { await api.updateShape(firstSelected.id, { [field]: v }); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  // â€” Create piece template â€”
  const saveNewPiece = async () => {
    if (!newPiece?.name || !newPiece?.category) return;
    setPiecesSaving(true);
    try {
      const saved = await api.createTemplate({
        name:         newPiece.name,
        category:     newPiece.category,
        width_inches: parseFloat(newPiece.width_inches) || 35,
        depth_inches: parseFloat(newPiece.depth_inches) || 24,
        color:        newPiece.color || null,
      });
      setTemplates((prev) => [...prev, saved]);
      setNewPiece(null);
    } catch (e) { setError(e.message); }
    finally { setPiecesSaving(false); }
  };

  // â€” Delete piece template â€”
  const deleteTemplate = async (id) => {
    try {
      await api.deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) { setError(e.message); }
  };

  // â€” Create group from selected shapes â€”
  const createGroup = async () => {
    if (selectedIds.size < 1 || !selectedFloor) return;
    setGrouping(true);
    try {
      const g = await api.createGroup(selectedFloor.id, {
        range_id:     groupForm.range_id ? parseInt(groupForm.range_id) : null,
        label:        groupForm.label || null,
        ladder01_end: groupForm.ladder01_end || "left",
      });
      await api.assignShapesToGroup(g.id, [...selectedIds]);
      setGroups((prev) => [...prev, g]);
      setShapes((prev) => prev.map((s) => selectedIds.has(s.id) ? { ...s, group_id: g.id } : s));
      // Also update range_id on shapes from the group
      if (groupForm.range_id) {
        const rid = parseInt(groupForm.range_id);
        setShapes((prev) => prev.map((s) => selectedIds.has(s.id) ? { ...s, range_id: rid } : s));
      }
      setGroupForm({ range_id: "", ladder01_end: "left", label: "" });
    } catch (e) { setError(e.message); }
    finally { setGrouping(false); }
  };

  // â€” Update group â€”
  const patchGroup = async (field, value) => {
    if (!sharedGroupId) return;
    const patch = { [field]: value === "" ? null : value };
    try {
      await api.updateGroup(sharedGroupId, patch);
      setGroups((prev) => prev.map((g) => g.id === sharedGroupId ? { ...g, ...patch } : g));
    } catch (e) { setError(e.message); }
  };

  // â€” Ungroup â€”
  const ungroupSelected = async () => {
    if (!sharedGroupId) return;
    try {
      await api.deleteGroup(sharedGroupId);
      setGroups((prev) => prev.filter((g) => g.id !== sharedGroupId));
      setShapes((prev) => prev.map((s) => s.group_id === sharedGroupId ? { ...s, group_id: null } : s));
    } catch (e) { setError(e.message); }
  };

  // â€” SVG pointer math â€”
  // getScreenCTM accounts for viewBox automatically — no manual pan offset needed.
  const getSVGPoint = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const inv = svg.getScreenCTM()?.inverse();
    if (!inv) return { x: 0, y: 0 };
    const r = pt.matrixTransform(inv);
    return { x: r.x, y: r.y };
  }, []);

  const onShapeDown = (e, id, mode) => {
    e.stopPropagation();
    e.preventDefault();
    const shape = shapes.find((s) => s.id === id);
    if (!shape) return;

    // Selection
    if (e.shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else if (!selectedIds.has(id)) {
      setSelectedIds(new Set([id]));
    }

    const pt = getSVGPoint(e);
    // Gather original positions of group siblings for group-move
    const groupMembers = shape.group_id
      ? shapes.filter((s) => s.group_id === shape.group_id).map((s) => ({ id: s.id, x: s.x, y: s.y }))
      : null;

    setDragging({ id, mode, startX: pt.x, startY: pt.y, origX: shape.x, origY: shape.y, origW: shape.width, origH: shape.height, groupMembers });
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    const pt = getSVGPoint(e);
    const dx = pt.x - dragging.startX;
    const dy = pt.y - dragging.startY;

    if (dragging.mode === "resize") {
      setShapes((prev) => prev.map((s) => s.id !== dragging.id ? s : {
        ...s,
        width:  snap(Math.max(MIN_W, dragging.origW + dx)),
        height: snap(Math.max(MIN_H, dragging.origH + dy)),
      }));
      return;
    }

    // Move â€" apply grid snap then edge snap (negative coords allowed)
    let newX = snap(dragging.origX + dx);
    let newY = snap(dragging.origY + dy);

    // Only edge-snap when moving a single shape (not a group)
    if (!dragging.groupMembers) {
      const others = shapes.filter((s) => s.id !== dragging.id);
      const snapped = edgeSnap(newX, newY, dragging.origW, dragging.origH, others, dragging.id);
      newX = snapped.x;
      newY = snapped.y;
    }

    const moveDx = newX - dragging.origX;
    const moveDy = newY - dragging.origY;

    setShapes((prev) => prev.map((s) => {
      if (s.id === dragging.id) return { ...s, x: newX, y: newY };
      if (dragging.groupMembers) {
        const orig = dragging.groupMembers.find((m) => m.id === s.id);
        if (orig) return { ...s, x: snap(orig.x + moveDx), y: snap(orig.y + moveDy) };
      }
      return s;
    }));
  }, [dragging, shapes, getSVGPoint]);

  const onPointerUp = useCallback(async () => {
    if (!dragging) return;
    // Collect all shapes that moved
    const moved = dragging.groupMembers
      ? shapes.filter((s) => dragging.groupMembers.some((m) => m.id === s.id))
      : shapes.filter((s) => s.id === dragging.id);
    setDragging(null);
    setSaving(true);
    try {
      if (moved.length === 1 && dragging.mode !== "resize") {
        await api.updateShape(moved[0].id, { x: moved[0].x, y: moved[0].y, width: moved[0].width, height: moved[0].height });
      } else if (moved.length > 1) {
        await api.bulkUpdateShapes(moved.map((s) => ({ id: s.id, x: s.x, y: s.y })));
      } else if (dragging.mode === "resize") {
        const s = shapes.find((sh) => sh.id === dragging.id);
        if (s) await api.updateShape(s.id, { width: s.width, height: s.height });
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }, [dragging, shapes]);

  const onCanvasClick = (e) => {
    if (e.target === svgRef.current || e.target.tagName === "rect" && e.target === svgRef.current?.firstChild?.nextSibling) {
      if (!e.shiftKey) setSelectedIds(new Set());
    }
  };

  // â€" Canvas panning â€"
  const startPan = useCallback((e) => {
    e.preventDefault();
    panRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y, moved: false };
    setIsPanning(true);
    bgRef.current?.setPointerCapture(e.pointerId);
  }, [pan]);

  const onBgMove = useCallback((e) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) panRef.current.moved = true;
    const svg = svgRef.current;
    if (!svg || !svg.clientWidth) return;
    const scaleX = CANVAS_W / svg.clientWidth;
    const scaleY = CANVAS_H / svg.clientHeight;
    setPan({ x: panRef.current.origX - dx * scaleX, y: panRef.current.origY - dy * scaleY });
  }, []);

  const endPan = useCallback((e) => {
    setIsPanning(false);
    if (!panRef.current) return;
    if (!panRef.current.moved && !e.shiftKey) setSelectedIds(new Set());
    panRef.current = null;
  }, []);

  // â€" Keyboard shortcuts (R rotate, Esc deselect, Del delete) â€"
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "r" || e.key === "R") {
        const ids = [...selectedIdsRef.current];
        if (!ids.length) return;
        const newRots = {};
        shapesRef.current.forEach((s) => {
          if (selectedIdsRef.current.has(s.id)) newRots[s.id] = s.rotation === 0 ? 90 : 0;
        });
        setShapes((prev) => prev.map((s) => s.id in newRots ? { ...s, rotation: newRots[s.id] } : s));
        ids.forEach((id) => {
          if (id in newRots) api.updateShape(id, { rotation: newRots[id] }).catch(() => {});
        });
      }

      if (e.key === "Escape") setSelectedIds(new Set());

      if (e.key === "Delete" || e.key === "Backspace") {
        const ids = [...selectedIdsRef.current];
        if (!ids.length) return;
        setSelectedIds(new Set());
        setShapes((prev) => prev.filter((s) => !ids.includes(s.id)));
        ids.forEach((id) => api.deleteShape(id).catch(() => {}));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // â€” Group categories â€”
  const categories = [...new Set(templates.map((t) => t.category))].sort();

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>

      {/* â”€â”€ Top bar â”€â”€ */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/mapping")} className="text-sm text-gray-400 hover:text-gray-600">
            â† Mapping
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>Map Editor</h1>
          {saving && <span className="text-xs text-gray-400 ml-1">Savingâ€¦</span>}
        </div>
        <div className="flex items-center gap-2">
          {floors.map((f) => (
            <button key={f.id} onClick={() => loadFloor(f)}
              className={["px-4 py-1.5 rounded-full text-sm font-medium border transition-all",
                selectedFloor?.id === f.id ? "border-green-700 bg-green-700 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"].join(" ")}
            >{f.display_name}</button>
          ))}
          <button onClick={addBlankShape}
            className="ml-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: "#1E4D2B" }}
          >+ Blank Shape</button>
        </div>
      </div>

      {error && <p className="mb-2 text-sm text-red-600 bg-red-50 rounded px-3 py-2 shrink-0">{error}</p>}

      {/* â”€â”€ Three-panel body â”€â”€ */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* â”€â”€ Left: Piece Library â”€â”€ */}
        <div className="w-52 shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-gray-100 shrink-0">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800 text-sm">Piece Library</span>
              <button onClick={() => setNewPiece({ name: "", category: "", width_inches: "35", depth_inches: "24", color: "" })}
                className="text-xs font-semibold rounded px-2 py-1 text-white" style={{ backgroundColor: "#1E4D2B" }}>
                + New
              </button>
            </div>
          </div>

          {/* New piece inline form */}
          {newPiece && (
            <div className="px-3 py-3 border-b border-gray-100 bg-green-50 shrink-0 space-y-2">
              <input type="text" placeholder="Name" value={newPiece.name}
                onChange={(e) => setNewPiece((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-700" />
              <input type="text" placeholder="Category" value={newPiece.category}
                onChange={(e) => setNewPiece((p) => ({ ...p, category: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-700" />
              <div className="flex gap-1">
                <div className="flex-1">
                  <div className="text-xs text-gray-400 mb-0.5">Width (in)</div>
                  <input type="number" value={newPiece.width_inches} min="1"
                    onChange={(e) => setNewPiece((p) => ({ ...p, width_inches: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-700" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-400 mb-0.5">Depth (in)</div>
                  <input type="number" value={newPiece.depth_inches} min="1"
                    onChange={(e) => setNewPiece((p) => ({ ...p, depth_inches: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-700" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={newPiece.color || "#e5e7eb"}
                  onChange={(e) => setNewPiece((p) => ({ ...p, color: e.target.value }))}
                  className="w-7 h-7 rounded border border-gray-300 cursor-pointer" />
                <span className="text-xs text-gray-400">Color (opt.)</span>
              </div>
              <div className="flex gap-1 pt-1">
                <button onClick={saveNewPiece} disabled={piecesSaving}
                  className="flex-1 text-xs font-semibold py-1 rounded text-white disabled:opacity-50"
                  style={{ backgroundColor: "#1E4D2B" }}>
                  {piecesSaving ? "â€¦" : "Save"}
                </button>
                <button onClick={() => setNewPiece(null)}
                  className="flex-1 text-xs py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Category groups */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
            {templates.length === 0 && (
              <p className="text-xs text-gray-400 px-2 pt-1">No pieces yet. Create one to get started.</p>
            )}
            {categories.map((cat) => (
              <div key={cat}>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">{cat}</div>
                {templates.filter((t) => t.category === cat).map((tpl) => (
                  <div key={tpl.id}
                    className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                    title={`${tpl.width_inches}" Ã— ${tpl.depth_inches}"`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-sm border shrink-0"
                        style={{ backgroundColor: tpl.color || DEFAULT_FILL, borderColor: tpl.color || DEFAULT_STROKE }} />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-700 truncate">{tpl.name}</div>
                        <div className="text-xs text-gray-400">{tpl.width_inches}"Ã—{tpl.depth_inches}"</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => placeTemplate(tpl)}
                        className="text-xs px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: "#1E4D2B" }}
                        title="Place on canvas">+</button>
                      <button onClick={() => deleteTemplate(tpl.id)}
                        className="text-xs px-1.5 py-0.5 rounded text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400"
                        title="Delete template">Ã—</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Scale indicator */}
          <div className="px-3 py-2 border-t border-gray-100 shrink-0">
            <div className="text-xs text-gray-400">Scale: 1" = {PPI}px</div>
          </div>
        </div>

        {/* â”€â”€ Center: Canvas â”€â”€ */}
        <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm min-h-0"
          style={{ cursor: isPanning ? "grabbing" : "default" }}>
          {loading ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loadingâ€¦</div>
          ) : (
            <svg ref={svgRef} width="100%" height="100%"
              viewBox={`${pan.x} ${pan.y} ${CANVAS_W} ${CANVAS_H}`}
              style={{ display: "block", touchAction: "none", minHeight: 500 }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* Grid */}
              <defs>
                <pattern id="ed-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                  <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect ref={bgRef}
                x={pan.x - 5000} y={pan.y - 5000}
                width={CANVAS_W + 10000} height={CANVAS_H + 10000}
                fill="url(#ed-grid)"
                style={{ cursor: isPanning ? "grabbing" : "grab" }}
                onPointerDown={startPan}
                onPointerMove={onBgMove}
                onPointerUp={endPan}
              />

              {/* Group outlines (dashed bounding boxes) */}
              {groups.map((g) => {
                const members = shapes.filter((s) => s.group_id === g.id);
                if (!members.length) return null;
                const bb = bbox(members);
                const PAD = 6;
                const lx = bb.x - PAD, ly = bb.y - PAD;
                const lw = bb.x2 - bb.x + PAD * 2, lh = bb.y2 - bb.y + PAD * 2;
                const isSelected = members.some((s) => selectedIds.has(s.id));
                const groupRange = ranges.find((r) => r.id === g.range_id);

                // Ladder-01 arrow indicator
                const arrowLen = 14;
                let arrowPath = null;
                if (g.ladder01_end === "left")   arrowPath = `M ${lx+arrowLen} ${ly+lh/2} L ${lx} ${ly+lh/2} L ${lx+6} ${ly+lh/2-5} M ${lx} ${ly+lh/2} L ${lx+6} ${ly+lh/2+5}`;
                if (g.ladder01_end === "right")  arrowPath = `M ${lx+lw-arrowLen} ${ly+lh/2} L ${lx+lw} ${ly+lh/2} L ${lx+lw-6} ${ly+lh/2-5} M ${lx+lw} ${ly+lh/2} L ${lx+lw-6} ${ly+lh/2+5}`;
                if (g.ladder01_end === "top")    arrowPath = `M ${lx+lw/2} ${ly+arrowLen} L ${lx+lw/2} ${ly} L ${lx+lw/2-5} ${ly+6} M ${lx+lw/2} ${ly} L ${lx+lw/2+5} ${ly+6}`;
                if (g.ladder01_end === "bottom") arrowPath = `M ${lx+lw/2} ${ly+lh-arrowLen} L ${lx+lw/2} ${ly+lh} L ${lx+lw/2-5} ${ly+lh-6} M ${lx+lw/2} ${ly+lh} L ${lx+lw/2+5} ${ly+lh-6}`;

                return (
                  <g key={g.id}>
                    <rect x={lx} y={ly} width={lw} height={lh} fill="none"
                      stroke={isSelected ? "#1E4D2B" : "#9ca3af"}
                      strokeWidth={isSelected ? 2 : 1.5}
                      strokeDasharray="6 3" rx={6} style={{ pointerEvents: "none" }} />
                    {groupRange && (
                      <text x={lx + 5} y={ly - 5} fontSize={11} fill={isSelected ? "#1E4D2B" : "#6b7280"}
                        fontWeight="600" style={{ pointerEvents: "none", userSelect: "none" }}>
                        {groupRange.range_number} {g.ladder01_end ? `(L01 â†’${g.ladder01_end})` : ""}
                      </text>
                    )}
                    {arrowPath && (
                      <path d={arrowPath} fill="none" stroke="#1E4D2B" strokeWidth="2"
                        strokeLinecap="round" style={{ pointerEvents: "none" }} />
                    )}
                  </g>
                );
              })}

              {/* Shapes */}
              {shapes.map((shape) => {
                const [fill, stroke] = shapeColors(shape, ranges);
                const label = shapeLabel(shape, ranges);
                const isSelected = selectedIds.has(shape.id);
                const cx = shape.x + shape.width / 2;
                const cy = shape.y + shape.height / 2;
                return (
                  <g key={shape.id} transform={`rotate(${shape.rotation},${cx},${cy})`}>
                    <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height}
                      fill={fill}
                      stroke={isSelected ? "#1E4D2B" : stroke}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      rx={3} style={{ cursor: "grab" }}
                      onPointerDown={(e) => onShapeDown(e, shape.id, "move")}
                      onClick={(e) => { e.stopPropagation(); if (!e.shiftKey) setSelectedIds(new Set([shape.id])); }}
                    />
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.min(12, shape.height * 0.38, shape.width * 0.22)}
                      fontWeight="600" fill={isSelected ? "#1E4D2B" : "#374151"}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >{label}</text>
                    {isSelected && (
                      <rect x={shape.x + shape.width - HANDLE} y={shape.y + shape.height - HANDLE}
                        width={HANDLE} height={HANDLE} fill="#1E4D2B" rx={2}
                        style={{ cursor: "nwse-resize" }}
                        onPointerDown={(e) => onShapeDown(e, shape.id, "resize")} />
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* â”€â”€ Right: Properties Panel â”€â”€ */}
        {rightPanelMode !== "none" && (
          <div className="w-64 shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4 self-start overflow-y-auto" style={{ maxHeight: "100%" }}>

            {/* â”€â”€ Single shape panel â”€â”€ */}
            {rightPanelMode === "shape" && firstSelected && (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 text-sm">Shape</span>
                  <span className="text-xs text-gray-400">
                    {parseFloat(firstSelected.width / PPI).toFixed(1)}" Ã— {parseFloat(firstSelected.height / PPI).toFixed(1)}"
                  </span>
                </div>

                {firstSelected.template_id && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">
                    Template: <span className="font-medium">{templates.find((t) => t.id === firstSelected.template_id)?.name || "â€”"}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Linked Range</label>
                  <select value={firstSelected.range_id || ""}
                    onChange={(e) => patchShape("range_id", e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700">
                    <option value="">â€” unlinked â€”</option>
                    {ranges.map((r) => <option key={r.id} value={r.id}>Range {r.range_number}{r.material_type ? ` (${r.material_type})` : ""}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Label Override</label>
                  <input type="text" value={firstSelected.label || ""} placeholder="Auto-label from range"
                    onChange={(e) => patchShape("label", e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Color Override</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={firstSelected.color || "#e5e7eb"}
                      onChange={(e) => patchShape("color", e.target.value)}
                      className="w-8 h-8 rounded border border-gray-300 cursor-pointer" />
                    {firstSelected.color
                      ? <button onClick={() => patchShape("color", null)} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                      : <span className="text-xs text-gray-400">Using material type</span>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Rotation</label>
                  <div className="flex gap-2">
                    {[0, 90].map((deg) => (
                      <button key={deg} onClick={() => patchShape("rotation", deg)}
                        className={["flex-1 py-1.5 rounded border text-xs font-medium transition-all",
                          firstSelected.rotation === deg ? "border-green-700 bg-green-700 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"].join(" ")}
                      >{deg === 0 ? "Horizontal" : "Vertical"}</button>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-gray-400 bg-gray-50 rounded p-2 font-mono">
                  x: {firstSelected.x}  y: {firstSelected.y}<br />
                  w: {firstSelected.width}  h: {firstSelected.height}
                </div>

                <button onClick={deleteSelected}
                  className="w-full py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">
                  Delete Shape
                </button>
              </>
            )}

            {/* â”€â”€ Multi-select â†’ group creation â”€â”€ */}
            {rightPanelMode === "multi" && (
              <>
                <div className="font-semibold text-gray-800 text-sm">{selectedIds.size} shapes selected</div>
                <div className="text-xs text-gray-500">Group these pieces into a range:</div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Range</label>
                  <select value={groupForm.range_id}
                    onChange={(e) => setGroupForm((f) => ({ ...f, range_id: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700">
                    <option value="">â€” unlinked â€”</option>
                    {ranges.map((r) => <option key={r.id} value={r.id}>Range {r.range_number}{r.material_type ? ` (${r.material_type})` : ""}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ladder 01 End</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {["left","right","top","bottom"].map((end) => (
                      <button key={end} onClick={() => setGroupForm((f) => ({ ...f, ladder01_end: end }))}
                        className={["py-1.5 rounded border text-xs font-medium capitalize transition-all",
                          groupForm.ladder01_end === end ? "border-green-700 bg-green-700 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"].join(" ")}
                      >{end}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Group Label (optional)</label>
                  <input type="text" value={groupForm.label} placeholder="e.g. Range 15 A/B"
                    onChange={(e) => setGroupForm((f) => ({ ...f, label: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700" />
                </div>

                <button onClick={createGroup} disabled={grouping}
                  className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "#1E4D2B" }}>
                  {grouping ? "Groupingâ€¦" : "Group as Range"}
                </button>

                <button onClick={deleteSelected}
                  className="w-full py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">
                  Delete Selected
                </button>
              </>
            )}

            {/* â”€â”€ Existing group panel â”€â”€ */}
            {rightPanelMode === "group" && sharedGroup && (
              <>
                <div className="font-semibold text-gray-800 text-sm">Group</div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Linked Range</label>
                  <select value={sharedGroup.range_id || ""}
                    onChange={(e) => patchGroup("range_id", e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700">
                    <option value="">â€” unlinked â€”</option>
                    {ranges.map((r) => <option key={r.id} value={r.id}>Range {r.range_number}{r.material_type ? ` (${r.material_type})` : ""}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ladder 01 End</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {["left","right","top","bottom"].map((end) => (
                      <button key={end} onClick={() => patchGroup("ladder01_end", end)}
                        className={["py-1.5 rounded border text-xs font-medium capitalize transition-all",
                          sharedGroup.ladder01_end === end ? "border-green-700 bg-green-700 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"].join(" ")}
                      >{end}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
                  <input type="text" value={sharedGroup.label || ""}
                    onChange={(e) => patchGroup("label", e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700" />
                </div>

                <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1.5">
                  {selectedIds.size} piece{selectedIds.size !== 1 ? "s" : ""} in group
                </div>

                <button onClick={ungroupSelected}
                  className="w-full py-2 rounded-lg border border-amber-200 text-amber-700 text-sm hover:bg-amber-50">
                  Ungroup
                </button>

                <button onClick={deleteSelected}
                  className="w-full py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">
                  Delete Pieces
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* â”€â”€ Legend â”€â”€ */}
      <div className="mt-3 flex flex-wrap items-center gap-3 shrink-0">
        {Object.entries(MAT_FILL).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-3.5 h-3.5 rounded border" style={{ backgroundColor: color, borderColor: MAT_STROKE[type] }} />
            {type}
          </div>
        ))}
        <span className="text-xs text-gray-400 ml-auto">
          Drag canvas to pan &nbsp;&middot;&nbsp;{" "}
          <kbd className="font-mono bg-gray-100 px-1 rounded">R</kbd> rotate &nbsp;&middot;&nbsp;{" "}
          <kbd className="font-mono bg-gray-100 px-1 rounded">Esc</kbd> deselect &nbsp;&middot;&nbsp;{" "}
          <kbd className="font-mono bg-gray-100 px-1 rounded">Del</kbd> delete
        </span>
      </div>
    </div>
  );
}

