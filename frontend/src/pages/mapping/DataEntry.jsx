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

const STEP = { FLOOR: 1, RANGE_BATCH: 2, BATCH_CONFIG: 3, SHELVES: 4, REVIEW: 5 };

export default function DataEntry() {
  const navigate = useNavigate();

  const [facility, setFacility]           = useState("storage");
  const [floors, setFloors]               = useState([]);
  const [morganLocations, setMorganLocations] = useState([]);
  const [step, setStep]                   = useState(STEP.FLOOR);
  const [error, setError]                 = useState("");
  const [saving, setSaving]               = useState(false);
  const [saveProgress, setSaveProgress]   = useState("");

  // Floor creation (Morgan)
  const [showFloorForm, setShowFloorForm] = useState(false);
  const [newFloorCode, setNewFloorCode]   = useState("");
  const [newFloorName, setNewFloorName]   = useState("");
  const [creatingFloor, setCreatingFloor] = useState(false);

  // Step 1 + 2 state
  const [floorId, setFloorId]             = useState("");
  const [floorCode, setFloorCode]         = useState("");
  const [rangeStart, setRangeStart]       = useState("");
  const [rangeEnd, setRangeEnd]           = useState("");
  const [materialType, setMaterialType]   = useState("general stacks");
  const [notes, setNotes]                 = useState("");
  const [selectedLocationCodes, setSelectedLocationCodes] = useState([]);

  // Step 3 state
  const [batchSides, setBatchSides]               = useState(["A", "B"]);
  const [batchLaddersPerSide, setBatchLaddersPerSide] = useState("");
  const [batchShelvesPerLadder, setBatchShelvesPerLadder] = useState("");
  const [rangeOverrides, setRangeOverrides]       = useState({});
  const [editingRange, setEditingRange]           = useState(null);

  // Step 4 state
  const [shelvesData, setShelvesData]             = useState({});
  const [rangeLadderFill, setRangeLadderFill]     = useState({});
  const [rangeGlobalFill, setRangeGlobalFill]     = useState({});
  const [currentRangeIndex, setCurrentRangeIndex] = useState(0);

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

  // -- Helpers ----------------------------------------------------------------

  const getRangeNumbers = () => {
    const start = parseInt(rangeStart, 10);
    const end   = parseInt(rangeEnd, 10);
    if (isNaN(start) || isNaN(end) || start > end) return [];
    return Array.from({ length: end - start + 1 }, (_, i) => zeroPad(start + i));
  };

  const getEffectiveConfig = (rnStr) => {
    const ovr = rangeOverrides[rnStr] || {};
    return {
      sides:            ovr.sides            ?? batchSides,
      laddersPerSide:   parseInt(ovr.laddersPerSide   ?? batchLaddersPerSide,   10) || 0,
      shelvesPerLadder: parseInt(ovr.shelvesPerLadder ?? batchShelvesPerLadder, 10) || 0,
    };
  };

  const hasOverride = (rnStr) => {
    const ovr = rangeOverrides[rnStr];
    return ovr !== undefined && Object.keys(ovr).length > 0;
  };

  // -- Step handlers ----------------------------------------------------------

  const pickFloor = (floor) => {
    setFloorId(floor.id);
    setFloorCode(floor.code);
    setRangeStart("");
    setRangeEnd("");
    setSelectedLocationCodes([]);
    setError("");
    setStep(STEP.RANGE_BATCH);
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

  const submitRangeBatch = () => {
    const start = parseInt(rangeStart, 10);
    const end   = parseInt(rangeEnd, 10);
    if (!rangeStart || isNaN(start) || start < 1 || start > 99) {
      setError("Enter a valid start range number (1-99)."); return;
    }
    if (!rangeEnd || isNaN(end) || end < 1 || end > 99) {
      setError("Enter a valid end range number (1-99)."); return;
    }
    if (start > end) {
      setError("Start must be less than or equal to end."); return;
    }
    setBatchSides(defaultSides(facility, floorCode, rangeStart));
    setBatchLaddersPerSide("");
    setBatchShelvesPerLadder("");
    setRangeOverrides({});
    setEditingRange(null);
    setError("");
    setStep(STEP.BATCH_CONFIG);
  };

  const toggleBatchSide = (letter) => {
    setBatchSides((prev) =>
      prev.includes(letter) ? prev.filter((s) => s !== letter) : [...prev, letter].sort()
    );
  };

  const toggleOverrideSide = (rnStr, letter) => {
    setRangeOverrides((prev) => {
      const ovr = prev[rnStr] || {};
      const current = ovr.sides ?? batchSides;
      const next = current.includes(letter)
        ? current.filter((s) => s !== letter)
        : [...current, letter].sort();
      return { ...prev, [rnStr]: { ...ovr, sides: next } };
    });
  };

  const setOverrideField = (rnStr, field, value) => {
    setRangeOverrides((prev) => ({
      ...prev,
      [rnStr]: { ...(prev[rnStr] || {}), [field]: value },
    }));
  };

  const resetOverride = (rnStr) => {
    setRangeOverrides((prev) => {
      const next = { ...prev };
      delete next[rnStr];
      return next;
    });
    setEditingRange(null);
  };

  const submitBatchConfig = () => {
    if (batchSides.length === 0) {
      setError("Select at least one side."); return;
    }
    const lps = parseInt(batchLaddersPerSide, 10);
    if (!batchLaddersPerSide || isNaN(lps) || lps < 1 || lps > 99) {
      setError("Enter a valid default ladder count per side (1-99)."); return;
    }
    const spl = parseInt(batchShelvesPerLadder, 10);
    if (!batchShelvesPerLadder || isNaN(spl) || spl < 1 || spl > 99) {
      setError("Enter a valid default shelf count per ladder (1-99)."); return;
    }
    for (const [rnStr, ovr] of Object.entries(rangeOverrides)) {
      if (ovr.sides !== undefined && ovr.sides.length === 0) {
        setError("Range " + rnStr + ": select at least one side."); return;
      }
      if (ovr.laddersPerSide !== undefined) {
        const l = parseInt(ovr.laddersPerSide, 10);
        if (isNaN(l) || l < 1 || l > 99) {
          setError("Range " + rnStr + ": enter a valid ladder count (1-99)."); return;
        }
      }
      if (ovr.shelvesPerLadder !== undefined) {
        const s = parseInt(ovr.shelvesPerLadder, 10);
        if (isNaN(s) || s < 1 || s > 99) {
          setError("Range " + rnStr + ": enter a valid shelf count (1-99)."); return;
        }
      }
    }
    const start = parseInt(rangeStart, 10);
    const end   = parseInt(rangeEnd, 10);
    const newShelvesData = {};
    for (let rn = start; rn <= end; rn++) {
      const rnStr = zeroPad(rn);
      const ovr = rangeOverrides[rnStr] || {};
      const sides           = ovr.sides            ?? batchSides;
      const laddersPerSide  = parseInt(ovr.laddersPerSide   ?? batchLaddersPerSide,   10);
      const shelvesPerLadder = parseInt(ovr.shelvesPerLadder ?? batchShelvesPerLadder, 10);
      for (const side of sides) {
        for (let l = 1; l <= laddersPerSide; l++) {
          newShelvesData[rnStr + "-" + side + "-" + l] = emptyShelvesForLadder(shelvesPerLadder);
        }
      }
    }
    setShelvesData(newShelvesData);
    setCurrentRangeIndex(0);
    setRangeLadderFill({});
    setRangeGlobalFill({});
    setError("");
    setStep(STEP.SHELVES);
  };

  const applyGlobalFill = (rnStr) => {
    const val = rangeGlobalFill[rnStr] || "";
    if (!val) return;
    const { sides, laddersPerSide } = getEffectiveConfig(rnStr);
    setShelvesData((prev) => {
      const next = { ...prev };
      for (const side of sides) {
        for (let l = 1; l <= laddersPerSide; l++) {
          const key = rnStr + "-" + side + "-" + l;
          if (next[key]) next[key] = next[key].map((s) => ({ ...s, width_inches: val }));
        }
      }
      return next;
    });
  };

  const applyLadderFill = (key) => {
    const val = rangeLadderFill[key] || "";
    if (!val) return;
    setShelvesData((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((s) => ({ ...s, width_inches: val })),
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

  const handleSaveAll = async () => {
    setSaving(true);
    setError("");
    const rangeNums = getRangeNumbers();
    for (let i = 0; i < rangeNums.length; i++) {
      const rnStr = rangeNums[i];
      setSaveProgress("Saving range " + rnStr + " (" + (i + 1) + " of " + rangeNums.length + ")...");
      const { sides, laddersPerSide } = getEffectiveConfig(rnStr);
      try {
        const sidesPayload = sides.map((side) => ({
          side_letter: side,
          ladders: Array.from({ length: laddersPerSide }, (_, j) => {
            const lNum = j + 1;
            const key  = rnStr + "-" + side + "-" + lNum;
            const shelves = (shelvesData[key] || []).map((s) => ({
              shelf_number: s.shelf_number,
              width_inches: s.width_inches !== "" && s.width_inches !== null
                ? parseFloat(s.width_inches)
                : null,
            }));
            return { ladder_number: zeroPad(lNum), shelves };
          }),
        }));
        await api.createRange({
          floor_id:      floorId,
          range_number:  rnStr,
          material_type: materialType,
          notes:         notes || null,
          location_codes: selectedLocationCodes,
          sides:         sidesPayload,
        });
      } catch (e) {
        setError("Failed on range " + rnStr + ": " + e.message);
        setSaving(false);
        setSaveProgress("");
        return;
      }
    }
    setSaving(false);
    setSaveProgress("");
    navigate("/mapping/ranges");
  };

  // -- Derived ----------------------------------------------------------------

  const floor         = floors.find((f) => f.id === floorId);
  const facilityLabel = facility === "morgan" ? "Morgan Library" : "Storage";
  const rangeNumbers  = getRangeNumbers();
  const currentRangeNum = rangeNumbers[currentRangeIndex] ?? "";
  const currentConfig   = currentRangeNum
    ? getEffectiveConfig(currentRangeNum)
    : { sides: [], laddersPerSide: 0 };

  // -- Render -----------------------------------------------------------------

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

      {/* STEP 1 - Floor */}
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
                      {creatingFloor ? "Creating..." : "Create Floor"}
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

      {/* STEP 2 - Range batch + metadata */}
      {step === STEP.RANGE_BATCH && (
        <Section title={"Range Batch \u2014 " + floor?.display_name}>
          <div className="space-y-4">
            <div>
              <Label>Range Numbers</Label>
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="number" min="1" max="99"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  placeholder="Start"
                  className="w-24 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="number" min="1" max="99"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  placeholder="End"
                  className="w-24 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                For a single range, set start and end to the same number.
              </p>
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
                      className={"px-3 py-1 rounded-full text-sm border transition-colors " + (
                        selectedLocationCodes.includes(loc.code)
                          ? "bg-green-700 text-white border-green-700"
                          : "bg-white text-gray-600 border-gray-300 hover:border-green-600"
                      )}
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
                placeholder="Any notes about these ranges"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Back onClick={() => setStep(STEP.FLOOR)} />
            <Next onClick={submitRangeBatch} />
          </div>
        </Section>
      )}

      {/* STEP 3 - Batch config + per-range override table */}
      {step === STEP.BATCH_CONFIG && (
        <Section title="Configure Ranges">
          {/* Batch defaults */}
          <div className="mb-5 pb-5 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Batch Defaults
            </p>
            <div className="space-y-4">
              <div>
                <Label>Sides <span className="text-gray-400 font-normal">(applies to all ranges)</span></Label>
                <div className="flex gap-2 mt-1.5">
                  {["A", "B", "C", "D"].map((letter) => (
                    <button
                      key={letter}
                      onClick={() => toggleBatchSide(letter)}
                      className={"w-10 h-10 rounded-lg border text-sm font-bold transition-all " + (
                        batchSides.includes(letter)
                          ? "border-green-700 bg-green-700 text-white"
                          : "border-gray-300 bg-white text-gray-500 hover:border-gray-400"
                      )}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <Label>Ladders per side</Label>
                  <input
                    type="number" min="1" max="99"
                    value={batchLaddersPerSide}
                    onChange={(e) => setBatchLaddersPerSide(e.target.value)}
                    placeholder="e.g. 10"
                    className="mt-1 block w-24 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                  />
                </div>
                <div>
                  <Label>Shelves per ladder</Label>
                  <input
                    type="number" min="1" max="99"
                    value={batchShelvesPerLadder}
                    onChange={(e) => setBatchShelvesPerLadder(e.target.value)}
                    placeholder="e.g. 7"
                    className="mt-1 block w-24 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Per-range override table */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Per-Range Overrides
            </p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[3rem_1fr_1fr_1fr_5rem] gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
                <span>Range</span>
                <span>Sides</span>
                <span>Ladders/Side</span>
                <span>Shelves/Ladder</span>
                <span></span>
              </div>
              {rangeNumbers.map((rnStr) => {
                const ovr            = rangeOverrides[rnStr] || {};
                const effectiveSides = ovr.sides              ?? batchSides;
                const effectiveLPS   = ovr.laddersPerSide     ?? batchLaddersPerSide;
                const effectiveSPL   = ovr.shelvesPerLadder   ?? batchShelvesPerLadder;
                const isEditing      = editingRange === rnStr;
                const overridden     = hasOverride(rnStr);
                return (
                  <div
                    key={rnStr}
                    className={"border-b border-gray-100 last:border-b-0 " + (overridden ? "bg-amber-50" : "")}
                  >
                    <div className="grid grid-cols-[3rem_1fr_1fr_1fr_5rem] gap-2 px-3 py-2 items-center text-sm">
                      <span className="font-mono font-semibold text-gray-700">{rnStr}</span>
                      <span className="text-gray-600">
                        {effectiveSides.join(", ")}
                        {overridden && ovr.sides !== undefined && (
                          <span className="ml-1 text-xs text-amber-600">*</span>
                        )}
                      </span>
                      <span className="text-gray-600">
                        {effectiveLPS || "\u2014"}
                        {overridden && ovr.laddersPerSide !== undefined && (
                          <span className="ml-1 text-xs text-amber-600">*</span>
                        )}
                      </span>
                      <span className="text-gray-600">
                        {effectiveSPL || "\u2014"}
                        {overridden && ovr.shelvesPerLadder !== undefined && (
                          <span className="ml-1 text-xs text-amber-600">*</span>
                        )}
                      </span>
                      <span className="flex justify-end">
                        {!isEditing && (
                          <button
                            onClick={() => setEditingRange(rnStr)}
                            className="text-xs px-2 py-0.5 rounded border border-gray-300 hover:border-green-700 hover:text-green-700 transition-all"
                          >
                            Edit
                          </button>
                        )}
                      </span>
                    </div>
                    {isEditing && (
                      <div className="px-3 pb-3 pt-1 bg-white border-t border-gray-100 space-y-3">
                        <div>
                          <span className="text-xs font-medium text-gray-600">Sides</span>
                          <div className="flex gap-2 mt-1">
                            {["A", "B", "C", "D"].map((letter) => (
                              <button
                                key={letter}
                                onClick={() => toggleOverrideSide(rnStr, letter)}
                                className={"w-8 h-8 rounded border text-xs font-bold transition-all " + (
                                  effectiveSides.includes(letter)
                                    ? "border-green-700 bg-green-700 text-white"
                                    : "border-gray-300 bg-white text-gray-400 hover:border-gray-400"
                                )}
                              >
                                {letter}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div>
                            <span className="text-xs font-medium text-gray-600">Ladders/Side</span>
                            <input
                              type="number" min="1" max="99"
                              value={ovr.laddersPerSide ?? batchLaddersPerSide}
                              onChange={(e) => setOverrideField(rnStr, "laddersPerSide", e.target.value)}
                              className="mt-1 block w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                            />
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-600">Shelves/Ladder</span>
                            <input
                              type="number" min="1" max="99"
                              value={ovr.shelvesPerLadder ?? batchShelvesPerLadder}
                              onChange={(e) => setOverrideField(rnStr, "shelvesPerLadder", e.target.value)}
                              className="mt-1 block w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEditingRange(null)}
                            className="text-xs px-3 py-1 rounded border border-gray-300 bg-white hover:border-green-700 hover:text-green-700 transition-all"
                          >
                            Done
                          </button>
                          {overridden && (
                            <button
                              onClick={() => resetOverride(rnStr)}
                              className="text-xs text-amber-600 hover:text-amber-800 transition-colors"
                            >
                              Reset to defaults
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {rangeNumbers.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                <span className="text-amber-600">*</span> indicates a per-range override.
              </p>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <Back onClick={() => setStep(STEP.RANGE_BATCH)} />
            <Next onClick={submitBatchConfig} label="Set Widths" />
          </div>
        </Section>
      )}

      {/* STEP 4 - Shelf widths, range-by-range navigator */}
      {step === STEP.SHELVES && (
        <Section title="Shelf Widths">
          {/* Range navigator */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => setCurrentRangeIndex((i) => Math.max(0, i - 1))}
              disabled={currentRangeIndex === 0}
              className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:border-gray-400 disabled:opacity-30 disabled:cursor-default transition-all"
            >
              &larr; Prev
            </button>
            <div className="text-center">
              <span className="text-sm font-semibold text-gray-700">Range {currentRangeNum}</span>
              <span className="text-xs text-gray-400 ml-2">
                {currentRangeIndex + 1} of {rangeNumbers.length}
              </span>
            </div>
            <button
              onClick={() => setCurrentRangeIndex((i) => Math.min(rangeNumbers.length - 1, i + 1))}
              disabled={currentRangeIndex === rangeNumbers.length - 1}
              className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:border-gray-400 disabled:opacity-30 disabled:cursor-default transition-all"
            >
              Next &rarr;
            </button>
          </div>

          {/* Global fill for this range */}
          <div className="flex items-center gap-2 mb-5 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-sm text-gray-600 shrink-0">Fill all shelves in this range:</span>
            <input
              type="number" step="0.5" min="0"
              value={rangeGlobalFill[currentRangeNum] || ""}
              onChange={(e) => setRangeGlobalFill((p) => ({ ...p, [currentRangeNum]: e.target.value }))}
              placeholder="width in."
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
            />
            <button
              onClick={() => applyGlobalFill(currentRangeNum)}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white hover:border-green-700 hover:text-green-700 transition-all shrink-0"
            >
              Apply to all
            </button>
          </div>

          {/* Per side + ladder */}
          <div className="space-y-4">
            {currentConfig.sides.map((side) =>
              Array.from({ length: currentConfig.laddersPerSide }, (_, i) => {
                const lNum    = i + 1;
                const key     = currentRangeNum + "-" + side + "-" + lNum;
                const shelves = shelvesData[key] || [];
                const isExpanded = expandedLadderKeys.has(key);
                return (
                  <div key={key} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-gray-700 text-sm">
                        Side {side} &middot; Ladder {zeroPad(lNum)}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" step="0.5" min="0"
                          value={rangeLadderFill[key] || ""}
                          onChange={(e) => setRangeLadderFill((p) => ({ ...p, [key]: e.target.value }))}
                          placeholder="Fill ladder"
                          className="w-28 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-700"
                        />
                        <button
                          onClick={() => applyLadderFill(key)}
                          className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:border-green-700 hover:text-green-700 transition-all"
                        >
                          Fill
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {shelves.map((s, idx) => (
                        <div key={idx} className="flex flex-col gap-0.5">
                          <span className="text-xs text-gray-400">Shelf {s.shelf_number}</span>
                          <input
                            type="number" step="0.5" min="0"
                            value={s.width_inches}
                            onChange={(e) => setShelfWidth(key, idx, e.target.value)}
                            placeholder="in."
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <Back onClick={() => setStep(STEP.BATCH_CONFIG)} />
            <Next onClick={() => { setError(""); setStep(STEP.REVIEW); }} label="Review" />
          </div>
        </Section>
      )}

      {/* STEP 5 - Review & save */}
      {step === STEP.REVIEW && (
        <Section title="Review & Save">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-4 text-sm space-y-2 mb-4">
            <Row label="Facility"      value={facilityLabel} />
            <Row label="Floor"         value={floor?.display_name} />
            <Row
              label="Ranges"
              value={
                rangeNumbers.length === 1
                  ? rangeNumbers[0]
                  : rangeNumbers[0] + " - " + rangeNumbers[rangeNumbers.length - 1] + " (" + rangeNumbers.length + " ranges)"
              }
            />
            <Row label="Material type" value={materialType} />
            {selectedLocationCodes.length > 0 && (
              <Row label="Location codes" value={selectedLocationCodes.join(", ")} />
            )}
            {notes && <Row label="Notes" value={notes} />}
          </div>

          <div className="space-y-2 mb-4">
            {rangeNumbers.map((rnStr) => {
              const { sides, laddersPerSide } = getEffectiveConfig(rnStr);
              const totalShelves = sides.reduce((acc, side) => {
                for (let l = 1; l <= laddersPerSide; l++) {
                  acc += (shelvesData[rnStr + "-" + side + "-" + l] || []).length;
                }
                return acc;
              }, 0);
              return (
                <div
                  key={rnStr}
                  className={"px-4 py-2.5 rounded-lg border text-sm flex flex-wrap items-center gap-x-4 gap-y-1 " + (
                    hasOverride(rnStr) ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"
                  )}
                >
                  <span className="font-mono font-bold text-gray-700 w-8">{rnStr}</span>
                  <span className="text-gray-500">Sides: <strong className="text-gray-700">{sides.join(", ")}</strong></span>
                  <span className="text-gray-500">Ladders/side: <strong className="text-gray-700">{laddersPerSide}</strong></span>
                  <span className="text-gray-500">Total shelves: <strong className="text-gray-700">{totalShelves}</strong></span>
                  {hasOverride(rnStr) && (
                    <span className="ml-auto text-xs text-amber-600 font-medium">custom</span>
                  )}
                </div>
              );
            })}
          </div>

          {saveProgress && (
            <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2 mb-4">{saveProgress}</p>
          )}

          <div className="flex gap-3">
            <Back onClick={() => setStep(STEP.SHELVES)} />
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: "#1E4D2B" }}
            >
              {saving
                ? "Saving..."
                : rangeNumbers.length === 1
                  ? "Save Range"
                  : "Save All " + rangeNumbers.length + " Ranges"}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

// -- Sub-components -----------------------------------------------------------

function StepBar({ current }) {
  const labels = ["Floor", "Range", "Config", "Widths", "Review"];
  return (
    <div className="flex items-center gap-1 mb-6">
      {labels.map((label, i) => {
        const s      = i + 1;
        const done   = s < current;
        const active = s === current;
        return (
          <div key={label} className="flex items-center gap-1">
            <div
              className={"w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold " + (
                done || active ? "bg-green-700 text-white" : "bg-gray-200 text-gray-400"
              )}
            >
              {done ? "\u2713" : s}
            </div>
            <span className={"text-xs " + (active ? "text-gray-800 font-medium" : "text-gray-400")}>{label}</span>
            {i < labels.length - 1 && <span className="text-gray-200 mx-1">&rsaquo;</span>}
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
