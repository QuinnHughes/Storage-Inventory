import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

const FACILITY_KEY = "mappingFacility";

const MATERIAL_TYPES = [
  "general stacks",
  "microfilm",
  "microfiche",
  "oversize",
  "special collections",
  "elec media",
  "documents",
];

// Storage: ranges 11-53 on floor "1" have A/B/C/D; everything else is A/B.
// Morgan: always A/B.
function defaultSides(facility, floorCode, rangeNumber) {
  if (facility === "morgan") return ["A", "B"];
  const num = parseInt(rangeNumber, 10);
  if (floorCode === "1" && num >= 11 && num <= 53) return ["A", "B", "C", "D"];
  return ["A", "B"];
}

function zeroPad(n, len = 2) {
  return String(n).padStart(len, "0");
}

function emptyShelvesForLadder(count) {
  return Array.from({ length: count }, (_, i) => ({
    shelf_number: zeroPad(i + 1),
    width_inches: "",
  }));
}

const STEP = { FLOOR: 1, RANGE: 2, SIDES: 3, LADDERS: 4, SHELVES: 5, REVIEW: 6 };

export default function DataEntry() {
  const navigate = useNavigate();

  const [facility, setFacility]           = useState("storage");
  const [floors, setFloors]               = useState([]);
  const [morganLocations, setMorganLocations] = useState([]);
  const [step, setStep]                   = useState(STEP.FLOOR);
  const [error, setError]                 = useState("");
  const [saving, setSaving]               = useState(false);

  // Floor creation (Morgan)
  const [showFloorForm, setShowFloorForm] = useState(false);
  const [newFloorCode, setNewFloorCode]   = useState("");
  const [newFloorName, setNewFloorName]   = useState("");
  const [creatingFloor, setCreatingFloor] = useState(false);

  // Form state
  const [floorId, setFloorId]             = useState("");
  const [floorCode, setFloorCode]         = useState("");
  const [rangeNumber, setRangeNumber]     = useState("");
  const [rangeEnd, setRangeEnd]           = useState("");
  const [materialType, setMaterialType]   = useState("general stacks");
  const [notes, setNotes]                 = useState("");
  const [selectedLocationCodes, setSelectedLocationCodes] = useState([]);
  const [activeSides, setActiveSides]     = useState(["A", "B"]);
  const [ladderCounts, setLadderCounts]   = useState({});
  const [shelvesData, setShelvesData]     = useState({});
  const [shelfCounts, setShelfCounts]     = useState({});
  const [batchFill, setBatchFill]         = useState({});

  // Ladders step
  const [setAllLadderCount, setSetAllLadderCount]   = useState("");
  const [editingSide, setEditingSide]               = useState(null);

  // Shelves step
  const [globalShelfCount, setGlobalShelfCount]     = useState("");
  const [globalShelfWidth, setGlobalShelfWidth]     = useState("");
  const [expandedLadderKeys, setExpandedLadderKeys] = useState(new Set());

  useEffect(() => {
    const fac = localStorage.getItem(FACILITY_KEY) || "storage";
    setFacility(fac);
    api.getFloors(fac).then(setFloors).catch(() => setError("Could not load floors."));
    if (fac === "morgan") {
      api.getLocations("morgan").then(setMorganLocations).catch(() => {});
    }
  }, []);

  // ── Step handlers ──────────────────────────────────────────────────────────

  const pickFloor = (floor) => {
    setFloorId(floor.id);
    setFloorCode(floor.code);
    setRangeNumber("");
    setRangeEnd("");
    setSelectedLocationCodes([]);
    setError("");
    setStep(STEP.RANGE);
  };

  const createFloor = async () => {
    if (!newFloorCode.trim() || !newFloorName.trim()) {
      setError("Both floor code and display name are required.");
      return;
    }
    setCreatingFloor(true);
    setError("");
    try {
      await api.createFloor({
        code: newFloorCode.trim(),
        display_name: newFloorName.trim(),
        facility: "morgan",
      });
      const updated = await api.getFloors("morgan");
      setFloors(updated);
      setNewFloorCode("");
      setNewFloorName("");
      setShowFloorForm(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreatingFloor(false);
    }
  };

  const toggleLocationCode = (code) => {
    setSelectedLocationCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const submitRange = () => {
    const from = parseInt(rangeNumber, 10);
    const to = rangeEnd ? parseInt(rangeEnd, 10) : from;
    if (!rangeNumber || isNaN(from) || from < 1 || from > 99) {
      setError("Enter a starting range number between 1 and 99.");
      return;
    }
    if (rangeEnd && (isNaN(to) || to < from || to > 99)) {
      setError("'To' must be a number ≥ 'From' and ≤ 99.");
      return;
    }
    const suggested = defaultSides(facility, floorCode, rangeNumber);
    setActiveSides(suggested);
    setError("");
    setStep(STEP.SIDES);
  };

  const toggleSide = (letter) => {
    setActiveSides((prev) =>
      prev.includes(letter) ? prev.filter((s) => s !== letter) : [...prev, letter].sort()
    );
  };

  const submitSides = () => {
    if (activeSides.length === 0) { setError("Select at least one side."); return; }
    const counts = {};
    activeSides.forEach((s) => { counts[s] = ladderCounts[s] || ""; });
    setLadderCounts(counts);
    setError("");
    setStep(STEP.LADDERS);
  };

  const submitLadders = () => {
    for (const side of activeSides) {
      const c = parseInt(ladderCounts[side], 10);
      if (!c || c < 1 || c > 99) {
        setError(`Enter a valid ladder count for side ${side} (1–99).`);
        return;
      }
    }
    const counts = {};
    const shelves = {};
    const batch = {};
    activeSides.forEach((side) => {
      const lc = parseInt(ladderCounts[side], 10);
      for (let l = 1; l <= lc; l++) {
        const key = `${side}-${l}`;
        counts[key] = shelfCounts[key] || "";
        shelves[key] = shelvesData[key] || [];
        batch[key] = batchFill[key] || "";
      }
    });
    setShelfCounts(counts);
    setShelvesData(shelves);
    setBatchFill(batch);
    setExpandedLadderKeys(new Set());
    setError("");
    setStep(STEP.SHELVES);
  };

  const generateShelves = (key) => {
    const c = parseInt(shelfCounts[key], 10);
    if (!c || c < 1) return;
    setShelvesData((prev) => ({ ...prev, [key]: emptyShelvesForLadder(c) }));
  };

  const applyBatchFill = (key) => {
    const widthVal = batchFill[key];
    setShelvesData((prev) => ({
      ...prev,
      [key]: prev[key].map((s) => ({
        ...s,
        ...(widthVal !== "" && widthVal != null ? { width_inches: widthVal } : {}),
      })),
    }));
  };

  const applyGlobalFill = () => {
    const count = parseInt(globalShelfCount, 10);
    if (!count || count < 1) return;
    const newShelves = {};
    const newCounts = {};
    activeSides.forEach((side) => {
      const lc = parseInt(ladderCounts[side], 10);
      for (let l = 1; l <= lc; l++) {
        const key = `${side}-${l}`;
        newShelves[key] = Array.from({ length: count }, (_, i) => ({
          shelf_number: zeroPad(i + 1),
          width_inches: globalShelfWidth,
        }));
        newCounts[key] = String(count);
      }
    });
    setShelvesData((prev) => ({ ...prev, ...newShelves }));
    setShelfCounts((prev) => ({ ...prev, ...newCounts }));
    if (globalShelfWidth !== "") setBatchFill((prev) => {
      const next = { ...prev };
      Object.keys(newShelves).forEach(k => { next[k] = globalShelfWidth; });
      return next;
    });
  };

  const toggleExpandedLadder = (key) => {
    setExpandedLadderKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const setShelfField = (key, idx, field, val) => {
    setShelvesData((prev) => {
      const updated = [...prev[key]];
      updated[idx] = { ...updated[idx], [field]: val };
      return { ...prev, [key]: updated };
    });
  };

  const submitShelves = () => {
    setError("");
    setStep(STEP.REVIEW);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const sides = activeSides.map((side) => {
        const lc = parseInt(ladderCounts[side], 10);
        const ladders = Array.from({ length: lc }, (_, i) => {
          const lNum = i + 1;
          const key = `${side}-${lNum}`;
          const shelves = (shelvesData[key] || []).map((s) => ({
            shelf_number: s.shelf_number,
            width_inches: s.width_inches !== "" && s.width_inches !== null
              ? parseFloat(s.width_inches) : null,
          }));
          return { ladder_number: zeroPad(lNum), shelves };
        });
        return { side_letter: side, ladders };
      });

      const from = parseInt(rangeNumber, 10);
      const to = rangeEnd ? parseInt(rangeEnd, 10) : from;

      if (from === to) {
        await api.createRange({
          floor_id: floorId,
          range_number: zeroPad(from),
          material_type: materialType,
          notes: notes || null,
          location_codes: selectedLocationCodes,
          sides,
        });
      } else {
        await api.bulkCreateRanges({
          floor_id: floorId,
          range_from: from,
          range_to: to,
          material_type: materialType,
          notes: notes || null,
          location_codes: selectedLocationCodes,
          sides,
        });
      }

      navigate("/mapping/ranges");
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const floor = floors.find((f) => f.id === floorId);
  const facilityLabel = facility === "morgan" ? "Morgan Library" : "Storage";

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/mapping")} className="text-sm text-gray-400 hover:text-gray-600">
          ← Mapping
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>Data Entry</h1>
        <span className="ml-auto text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
          {facilityLabel}
        </span>
      </div>

      <StepBar current={step} />

      {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      {/* STEP 1 — Floor */}
      {step === STEP.FLOOR && (
        <Section title={facilityLabel}>
          {floors.length === 0 && !showFloorForm ? (
            <p className="text-sm text-gray-400 mb-4">
              No floors created yet for {facilityLabel}.
              {facility === "morgan" && " Add one below to get started."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {floors.map((f) => (
                <button
                  key={f.id}
                  onClick={() => pickFloor(f)}
                  className="rounded-lg border border-gray-200 bg-white hover:border-green-700 hover:shadow px-4 py-3 text-left transition-all"
                >
                  <div className="font-semibold text-gray-800">{f.display_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{f.code}</div>
                </button>
              ))}
            </div>
          )}

          {/* Morgan: inline floor creation */}
          {facility === "morgan" && (
            <div className="pt-3 border-t border-gray-100">
              {!showFloorForm ? (
                <button
                  onClick={() => setShowFloorForm(true)}
                  className="text-sm text-gray-500 hover:text-green-700 transition-colors"
                >
                  + Add shelf location
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-gray-600">New Floor</p>
                  <div className="flex gap-3 flex-wrap">
                    <div>
                      <Label>Code <span className="text-gray-400">(basement)</span></Label>
                      <input
                        className="mt-1 block w-32 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                        value={newFloorCode}
                        onChange={(e) => setNewFloorCode(e.target.value)}
                        placeholder="e.g. 1"
                      />
                    </div>
                    <div>
                      <Label>Display Name</Label>
                      <input
                        className="mt-1 block w-48 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                        value={newFloorName}
                        onChange={(e) => setNewFloorName(e.target.value)}
                        placeholder="e.g. First Floor"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={createFloor}
                      disabled={creatingFloor}
                      className="px-4 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                      style={{ backgroundColor: "#1E4D2B" }}
                    >
                      {creatingFloor ? "Creating…" : "Create Floor"}
                    </button>
                    <button
                      onClick={() => { setShowFloorForm(false); setNewFloorCode(""); setNewFloorName(""); }}
                      className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* STEP 2 — Range number + material + location codes */}
      {step === STEP.RANGE && (
        <Section title={`Range — ${floor?.display_name}`}>
          <div className="space-y-4">
            <div>
              <Label>Range Numbers</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number" min="1" max="99"
                  value={rangeNumber}
                  onChange={(e) => setRangeNumber(e.target.value)}
                  placeholder="From"
                  className="w-28 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="number" min="1" max="99"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  placeholder="To (optional)"
                  className="w-36 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Single number or a range (e.g. 1 to 7). Numbers are zero-padded. Same structure is applied to all.</p>
            </div>
            <div>
              <Label>Material Type</Label>
              <select
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
                className="mt-1 block w-56 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
              >
                {MATERIAL_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>

            {/* Morgan: location codes picker */}
            {facility === "morgan" && morganLocations.length > 0 && (
              <div>
                <Label>
                  Location Codes on this Range{" "}
                  <span className="text-gray-400 font-normal">(select all that apply)</span>
                </Label>
                <p className="text-xs text-gray-400 mt-0.5 mb-2">
                  Physical ranges often hold items from more than one Alma location.
                </p>
                <div className="flex flex-wrap gap-2">
                  {morganLocations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => toggleLocationCode(loc.code)}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                        selectedLocationCodes.includes(loc.code)
                          ? "bg-green-700 text-white border-green-700"
                          : "bg-white text-gray-600 border-gray-300 hover:border-green-600"
                      }`}
                    >
                      <span className="font-mono font-semibold">{loc.code}</span>
                      <span className="ml-1.5 text-xs opacity-75">{loc.display_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Notes <span className="text-gray-400">(optional)</span></Label>
              <input
                type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this range"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Back onClick={() => setStep(STEP.FLOOR)} />
            <Next onClick={submitRange} />
          </div>
        </Section>
      )}

      {/* STEP 3 — Sides */}
      {step === STEP.SIDES && (
        <Section title={`Sides — Range ${zeroPad(parseInt(rangeNumber, 10))}`}>
          <p className="text-sm text-gray-500 mb-4">
            Sides have been pre-selected based on range number. Adjust if needed.
          </p>
          <div className="flex gap-3">
            {["A", "B", "C", "D"].map((letter) => (
              <button
                key={letter}
                onClick={() => toggleSide(letter)}
                className={[
                  "w-12 h-12 rounded-lg border text-sm font-bold transition-all",
                  activeSides.includes(letter)
                    ? "border-green-700 bg-green-700 text-white"
                    : "border-gray-300 bg-white text-gray-500 hover:border-gray-400",
                ].join(" ")}
              >
                {letter}
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <Back onClick={() => setStep(STEP.RANGE)} />
            <Next onClick={submitSides} />
          </div>
        </Section>
      )}

      {/* STEP 4 — Ladder counts per side */}
      {step === STEP.LADDERS && (
        <Section title="Ladder Count per Side">
          {/* Set All */}
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-600">Set all sides:</span>
            <input
              type="number" min="1" max="99"
              value={setAllLadderCount}
              onChange={(e) => setSetAllLadderCount(e.target.value)}
              className="w-24 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
              placeholder="count"
            />
            <button
              onClick={() => {
                const n = parseInt(setAllLadderCount, 10);
                if (n > 0) {
                  const counts = {};
                  activeSides.forEach((s) => { counts[s] = String(n); });
                  setLadderCounts(counts);
                  setEditingSide(null);
                }
              }}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white hover:border-green-700 hover:text-green-700 transition-all"
            >
              Apply to all sides
            </button>
          </div>

          {/* Per-side rows */}
          <div className="space-y-2">
            {activeSides.map((side) => (
              <div key={side} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                <span className="w-14 text-sm font-medium text-gray-700">Side {side}</span>
                {editingSide === side ? (
                  <>
                    <input
                      type="number" min="1" max="99"
                      value={ladderCounts[side] || ""}
                      onChange={(e) => setLadderCounts((p) => ({ ...p, [side]: e.target.value }))}
                      className="w-24 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                      autoFocus
                    />
                    <span className="text-xs text-gray-400">ladders</span>
                    <button
                      onClick={() => setEditingSide(null)}
                      className="text-xs text-green-700 font-medium hover:text-green-800"
                    >
                      Done
                    </button>
                  </>
                ) : (
                  <>
                    <span className="w-28 text-sm text-gray-600">
                      {ladderCounts[side]
                        ? <>{ladderCounts[side]} <span className="text-gray-400">ladders</span></>
                        : <span className="text-gray-400 italic">not set</span>
                      }
                    </span>
                    <button
                      onClick={() => setEditingSide(side)}
                      className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-green-700 hover:text-green-700 transition-colors"
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <Back onClick={() => setStep(STEP.SIDES)} />
            <Next onClick={submitLadders} />
          </div>
        </Section>
      )}

      {/* STEP 5 — Shelves per ladder */}
      {step === STEP.SHELVES && (
        <Section title="Shelves per Ladder">
          {/* Fill All at top */}
          <div className="mb-5 pb-4 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-3">Fill All Ladders</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 mb-1"># Shelves</label>
                <input
                  type="number" min="1" max="99"
                  value={globalShelfCount}
                  onChange={(e) => setGlobalShelfCount(e.target.value)}
                  className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                  placeholder="e.g. 8"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Default width (in.) <span className="text-gray-400">(optional)</span></label>
                <input
                  type="number" step="0.5" min="0"
                  value={globalShelfWidth}
                  onChange={(e) => setGlobalShelfWidth(e.target.value)}
                  className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                  placeholder="e.g. 35"
                />
              </div>
              <button
                onClick={applyGlobalFill}
                className="px-4 py-1.5 text-sm font-medium text-white rounded-lg"
                style={{ backgroundColor: "#1E4D2B" }}
              >
                Apply to all ladders
              </button>
            </div>
          </div>

          {/* Individual ladders (collapsed by default) */}
          <div className="space-y-2">
            {activeSides.flatMap((side) => {
              const lc = parseInt(ladderCounts[side], 10);
              return Array.from({ length: lc }, (_, i) => {
                const lNum = i + 1;
                const key = `${side}-${lNum}`;
                const shelves = shelvesData[key] || [];
                const isExpanded = expandedLadderKeys.has(key);
                return (
                  <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Summary row */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                      <span className="text-sm font-medium text-gray-700">
                        Side {side} · Ladder {zeroPad(lNum)}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {shelves.length > 0 ? `${shelves.length} shelves` : "not set"}
                        </span>
                        <button
                          onClick={() => toggleExpandedLadder(key)}
                          className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-green-700 hover:text-green-700 transition-colors"
                        >
                          {isExpanded ? "Done" : "Edit"}
                        </button>
                      </div>
                    </div>

                    {/* Expanded editor */}
                    {isExpanded && (
                      <div className="px-4 py-3 bg-white border-t border-gray-100">
                        {/* Shelf count + generate */}
                        <div className="flex items-center gap-3 mb-3">
                          <input
                            type="number" min="1" max="99"
                            value={shelfCounts[key] || ""}
                            onChange={(e) => setShelfCounts((p) => ({ ...p, [key]: e.target.value }))}
                            placeholder="# shelves"
                            className="w-28 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                          />
                          <button
                            onClick={() => generateShelves(key)}
                            className="text-xs px-3 py-1 rounded border border-gray-300 bg-white hover:border-green-700 transition-all"
                          >
                            Generate
                          </button>
                        </div>

                        {shelves.length > 0 && (
                          <>
                            {/* Batch fill for this ladder */}
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <span className="text-xs text-gray-500">Fill all:</span>
                              <input
                                type="number" step="0.5" min="0"
                                value={batchFill[key] || ""}
                                onChange={(e) => setBatchFill((p) => ({ ...p, [key]: e.target.value }))}
                                placeholder="Width (in.)"
                                className="w-28 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-700"
                              />
                              <button
                                onClick={() => applyBatchFill(key)}
                                className="text-xs px-3 py-1 rounded border border-gray-300 bg-white hover:border-green-700 transition-all"
                              >
                                Apply
                              </button>
                            </div>

                            {/* Shelf grid — two inputs per shelf */}
                            <div className="grid grid-cols-4 gap-2">
                              {shelves.map((s, idx) => (
                                <div key={idx} className="flex flex-col gap-1">
                                  <span className="text-xs text-gray-400"># {s.shelf_number}</span>
                                  <input
                                    type="number" step="0.5" min="0"
                                    value={s.width_inches}
                                    onChange={(e) => setShelfField(key, idx, "width_inches", e.target.value)}
                                    placeholder="in."
                                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-700"
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })}
          </div>

          <div className="flex gap-3 mt-6">
            <Back onClick={() => setStep(STEP.LADDERS)} />
            <Next onClick={submitShelves} label="Review" />
          </div>
        </Section>
      )}

      {/* STEP 6 — Review & save */}
      {step === STEP.REVIEW && (
        <Section title="Review & Save">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-4 text-sm space-y-2 mb-6">
            <Row label="Facility"      value={facilityLabel} />
            <Row label="Floor"         value={floor?.display_name} />
            <Row label="Range" value={
              rangeEnd && parseInt(rangeEnd, 10) > parseInt(rangeNumber, 10)
                ? `${zeroPad(parseInt(rangeNumber, 10))} – ${zeroPad(parseInt(rangeEnd, 10))} (${parseInt(rangeEnd, 10) - parseInt(rangeNumber, 10) + 1} ranges)`
                : zeroPad(parseInt(rangeNumber, 10))
            } />
            <Row label="Material type" value={materialType} />
            {selectedLocationCodes.length > 0 && (
              <Row label="Location codes" value={selectedLocationCodes.join(", ")} />
            )}
            <Row label="Sides" value={activeSides.join(", ")} />
            {activeSides.map((side) => (
              <Row key={side} label={`Side ${side} ladders`} value={ladderCounts[side]} />
            ))}
            <Row
              label="Total shelves"
              value={Object.values(shelvesData).reduce((s, arr) => s + arr.length, 0)}
            />
            {notes && <Row label="Notes" value={notes} />}
          </div>
          <div className="flex gap-3">
            <Back onClick={() => setStep(STEP.SHELVES)} />
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: "#1E4D2B" }}
            >
              {saving ? "Saving…" : (rangeEnd && parseInt(rangeEnd, 10) > parseInt(rangeNumber, 10) ? "Save Ranges" : "Save Range")}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepBar({ current }) {
  const labels = ["Floor", "Range", "Sides", "Ladders", "Shelves", "Review"];
  return (
    <div className="flex items-center gap-1 mb-6">
      {labels.map((label, i) => {
        const s = i + 1;
        const done = s < current;
        const active = s === current;
        return (
          <div key={label} className="flex items-center gap-1">
            <div
              className={[
                "w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold",
                done || active ? "bg-green-700 text-white" : "bg-gray-200 text-gray-400",
              ].join(" ")}
            >
              {done ? "✓" : s}
            </div>
            <span className={`text-xs ${active ? "text-gray-800 font-medium" : "text-gray-400"}`}>{label}</span>
            {i < labels.length - 1 && <span className="text-gray-200 mx-1">›</span>}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-sm font-medium text-gray-700">{children}</label>;
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function Back({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm border border-gray-300 hover:bg-gray-50 transition-all"
    >
      Back
    </button>
  );
}

function Next({ onClick, label = "Next" }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all"
      style={{ backgroundColor: "#1E4D2B" }}
    >
      {label}
    </button>
  );
}

