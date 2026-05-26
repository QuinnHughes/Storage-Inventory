/**
 * ViewMap — read-only top-down floor plan viewer.
 * Renders the shapes saved by the Map Editor with hover tooltips showing range details.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

const CANVAS_W = 1400;
const CANVAS_H = 900;
const GRID = 10;

const MATERIAL_COLORS = {
  "general stacks":     "#d1fae5",
  "microfilm":          "#dbeafe",
  "microfiche":         "#ede9fe",
  "oversize":           "#fef9c3",
  "special collections":"#fce7f3",
  "elec media":         "#ffedd5",
  "documents":          "#f1f5f9",
};
const MATERIAL_BORDER = {
  "general stacks":     "#6ee7b7",
  "microfilm":          "#93c5fd",
  "microfiche":         "#c4b5fd",
  "oversize":           "#fde047",
  "special collections":"#f9a8d4",
  "elec media":         "#fdba74",
  "documents":          "#cbd5e1",
};
const DEFAULT_COLOR = "#e5e7eb";
const DEFAULT_BORDER = "#9ca3af";

export default function ViewMap() {
  const navigate = useNavigate();
  const [floors, setFloors] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [ranges, setRanges] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tooltip, setTooltip] = useState(null); // { shape, x, y }

  useEffect(() => {
    const facility = localStorage.getItem("mappingFacility") || "storage";
    api.getFloors(facility)
      .then((fs) => {
        setFloors(fs);
        if (fs.length > 0) loadFloor(fs[0]);
      })
      .catch(() => setError("Could not load floors."));
  }, []);

  const loadFloor = async (floor) => {
    setSelectedFloor(floor);
    setTooltip(null);
    setLoading(true);
    try {
      const [r, s] = await Promise.all([api.getRanges(floor.id), api.getShapes(floor.id)]);
      setRanges(r);
      setShapes(s.map((sh) => ({ ...sh, x: parseFloat(sh.x), y: parseFloat(sh.y), width: parseFloat(sh.width), height: parseFloat(sh.height) })));
    } catch {
      setError("Could not load floor data.");
    } finally {
      setLoading(false);
    }
  };

  const getRange = (id) => ranges.find((r) => r.id === id);

  const fillColor = (shape) => {
    if (shape.color) return [shape.color, shape.color];
    const r = getRange(shape.range_id);
    if (r?.material_type) return [MATERIAL_COLORS[r.material_type] || DEFAULT_COLOR, MATERIAL_BORDER[r.material_type] || DEFAULT_BORDER];
    return [DEFAULT_COLOR, DEFAULT_BORDER];
  };

  const labelFor = (shape) => {
    if (shape.label) return shape.label;
    const r = getRange(shape.range_id);
    return r ? r.range_number : "?";
  };

  const onShapeHover = (e, shape) => {
    const svg = e.currentTarget.closest("svg");
    const rect = svg.getBoundingClientRect();
    setTooltip({
      shape,
      range: getRange(shape.range_id),
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top + 12,
    });
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 4rem)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/mapping")} className="text-sm text-gray-400 hover:text-gray-600">
            ← Mapping
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>View Map</h1>
        </div>
        <div className="flex gap-2">
          {floors.map((f) => (
            <button
              key={f.id}
              onClick={() => loadFloor(f)}
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
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      {/* Canvas */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm relative">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div>
        ) : shapes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-sm gap-2">
            <span className="text-3xl">🗺</span>
            <span>No shapes placed yet. Use the Map Editor to build this floor plan.</span>
            <button
              onClick={() => navigate("/mapping/editor")}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: "#1E4D2B" }}
            >
              Open Map Editor
            </button>
          </div>
        ) : (
          <>
            <svg
              width={CANVAS_W}
              height={CANVAS_H}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              style={{ display: "block", maxWidth: "100%" }}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Grid */}
              <defs>
                <pattern id="grid-view" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                  <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width={CANVAS_W} height={CANVAS_H} fill="url(#grid-view)" />

              {shapes.map((shape) => {
                const [fill, stroke] = fillColor(shape);
                const label = labelFor(shape);
                return (
                  <g key={shape.id} transform={`rotate(${shape.rotation}, ${shape.x + shape.width / 2}, ${shape.y + shape.height / 2})`}>
                    <rect
                      x={shape.x}
                      y={shape.y}
                      width={shape.width}
                      height={shape.height}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={1.5}
                      rx={4}
                      style={{ cursor: "default" }}
                      onMouseMove={(e) => onShapeHover(e, shape)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                    <text
                      x={shape.x + shape.width / 2}
                      y={shape.y + shape.height / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.min(13, shape.height * 0.38, shape.width * 0.22)}
                      fontWeight="600"
                      fill="#374151"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {tooltip && (
              <div
                className="absolute z-10 pointer-events-none bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm max-w-xs"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                {tooltip.range ? (
                  <>
                    <div className="font-bold text-gray-800 mb-1">Range {tooltip.range.range_number}</div>
                    {tooltip.range.material_type && (
                      <div className="text-xs text-gray-500 mb-2 capitalize">{tooltip.range.material_type}</div>
                    )}
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div>{tooltip.range.side_count} side{tooltip.range.side_count !== 1 ? "s" : ""}</div>
                      <div>{tooltip.range.ladder_count} ladder{tooltip.range.ladder_count !== 1 ? "s" : ""}</div>
                      <div>{tooltip.range.shelf_count} shelf{tooltip.range.shelf_count !== 1 ? "ves" : ""}</div>
                      {tooltip.range.total_width_inches && (
                        <div>{parseFloat(tooltip.range.total_width_inches).toFixed(1)}" total width</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-gray-600">{tooltip.shape.label || "Unlabeled shape"}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.entries(MATERIAL_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-4 h-4 rounded border" style={{ backgroundColor: color, borderColor: MATERIAL_BORDER[type] }} />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}