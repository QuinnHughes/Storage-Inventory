import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

const MATERIAL_TYPES = [
  "general stacks",
  "microfilm",
  "microfiche",
  "oversize",
  "special collections",
  "elec media",
  "documents",
];

// First floor ranges 11-53 have A/B/C/D; all others (and other floors) have A/B only.
function defaultSides(floorCode, rangeNumber) {
  const num = parseInt(rangeNumber, 10);
  if (floorCode === "1" && num >= 11 && num <= 53) return ["A", "B", "C", "D"];
  return ["A", "B"];
}

function zeroPad(n, len = 2) {
  return String(n).padStart(len, "0");
}

// Build an empty shelf list for a ladder given a count
function emptyShelvesForLadder(count) {
  return Array.from({ length: count }, (_, i) => ({
    shelf_number: zeroPad(i + 1),
    width_inches: "",
  }));
}

const STEP = { FLOOR: 1, RANGE: 2, SIDES: 3, LADDERS: 4, SHELVES: 5, REVIEW: 6 };

export default function DataEntry() {
  const navigate = useNavigate();

  const [floors, setFloors] = useState([]);
  const [step, setStep] = useState(STEP.FLOOR);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Form state
  const [floorId, setFloorId] = useState("");
  const [floorCode, setFloorCode] = useState("");
  const [rangeNumber, setRangeNumber] = useState("");
  const [materialType, setMaterialType] = useState("general stacks");
  const [notes, setNotes] = useState("");
  const [activeSides, setActiveSides] = useState(["A", "B"]);

  // ladderCounts: { A: "5", B: "5", ... }
  const [ladderCounts, setLadderCounts] = useState({});

  // shelveData: { "A-1": [{shelf_number, width_inches}, ...], "A-2": [...], ... }
  const [shelvesData, setShelvesData] = useState({});
  // shelfCounts per ladder key: { "A-1": "10", ... }
  const [shelfCounts, setShelfCounts] = useState({});
  // batch-fill value per ladder key
  const [batchFill, setBatchFill] = useState({});

  useEffect(() => {
    api.getFloors().then(setFloors).catch(() => setError("Could not load floors."));
  }, []);

  // ── Step handlers ──────────────────────────────────────────────────────────

  const pickFloor = (floor) => {
    setFloorId(floor.id);
    setFloorCode(floor.code);
    setRangeNumber("");
    setError("");
    setStep(STEP.RANGE);
  };

  const submitRange = () => {
    const n = parseInt(rangeNumber, 10);
    if (!rangeNumber || isNaN(n) || n < 1 || n > 99) {
      setError("Enter a range number between 1 and 99.");
      return;
    }
    const suggested = defaultSides(floorCode, rangeNumber);
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

    // Build shelf count + shelves data skeleton
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
    setError("");
    setStep(STEP.SHELVES);
  };

  const generateShelves = (key) => {
    const c = parseInt(shelfCounts[key], 10);
    if (!c || c < 1) return;
    setShelvesData((prev) => ({ ...prev, [key]: emptyShelvesForLadder(c) }));
  };

  const applyBatchFill = (key) => {
    const val = batchFill[key];
    setShelvesData((prev) => ({
      ...prev,
      [key]: prev[key].map((s) => ({ ...s, width_inches: val })),
    }));
  };

  const setShelfWidth = (key, idx, val) => {
    setShelvesData((prev) => {
      const updated = [...prev[key]];
      updated[idx] = { ...updated[idx], width_inches: val };
      return { ...prev, [key]: updated };
    });
  };

  const submitShelves = () => {
    for (const side of activeSides) {
      const lc = parseInt(ladderCounts[side], 10);
      for (let l = 1; l <= lc; l++) {
        const key = `${side}-${l}`;
        if (!shelvesData[key] || shelvesData[key].length === 0) {
          setError(`Generate and fill shelves for side ${side}, ladder ${l}.`);
          return;
        }
      }
    }
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
              ? parseFloat(s.width_inches)
              : null,
          }));
          return { ladder_number: zeroPad(lNum), shelves };
        });
        return { side_letter: side, ladders };
      });

      await api.createRange({
        floor_id: floorId,
        range_number: zeroPad(parseInt(rangeNumber, 10)),
        material_type: materialType,
        notes: notes || null,
        sides,
      });

      navigate("/mapping/ranges");
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const floor = floors.find((f) => f.id === floorId);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/mapping")} className="text-sm text-gray-400 hover:text-gray-600">
          ← Mapping
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>Data Entry</h1>
      </div>

      <StepBar current={step} />

      {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

      {/* STEP 1 — Floor */}
      {step === STEP.FLOOR && (
        <Section title="Storage">
          <div className="grid grid-cols-3 gap-3">
            {floors.map((f) => (
              <button
                key={f.id}
                onClick={() => pickFloor(f)}
                className="rounded-lg border border-gray-200 bg-white hover:border-green-700 hover:shadow px-4 py-3 text-left transition-all"
              >
                <div className="font-semibold text-gray-800">{f.display_name}</div>
                <div className="text-xs text-gray-400 mt-0.5">Floor {f.code}</div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* STEP 2 — Range number + material */}
      {step === STEP.RANGE && (
        <Section title={`Range — ${floor?.display_name}`}>
          <div className="space-y-4">
            <div>
              <Label>Range Number</Label>
              <input
                type="number" min="1" max="99"
                value={rangeNumber}
                onChange={(e) => setRangeNumber(e.target.value)}
                placeholder="e.g. 15"
                className="mt-1 block w-32 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
              />
              <p className="text-xs text-gray-400 mt-1">Enter just the number — will be zero-padded.</p>
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
          <p className="text-sm text-gray-500 mb-4">Enter how many ladders each side has.</p>
          <div className="space-y-3">
            {activeSides.map((side) => (
              <div key={side} className="flex items-center gap-4">
                <span className="w-8 font-bold text-gray-700">Side {side}</span>
                <input
                  type="number" min="1" max="99"
                  value={ladderCounts[side] || ""}
                  onChange={(e) => setLadderCounts((p) => ({ ...p, [side]: e.target.value }))}
                  className="w-24 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                  placeholder="e.g. 10"
                />
                <span className="text-xs text-gray-400">ladders</span>
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
          <p className="text-sm text-gray-500 mb-4">
            For each ladder: set the shelf count, generate the rows, then enter widths.
            Use the batch fill to set all shelves on a ladder at once.
          </p>
          <div className="space-y-6">
            {activeSides.map((side) => {
              const lc = parseInt(ladderCounts[side], 10);
              return Array.from({ length: lc }, (_, i) => {
                const lNum = i + 1;
                const key = `${side}-${lNum}`;
                const shelves = shelvesData[key] || [];
                return (
                  <div key={key} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="font-semibold text-gray-700 mb-3">
                      Side {side} · Ladder {zeroPad(lNum)}
                    </div>

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
                        Generate shelves
                      </button>
                    </div>

                    {shelves.length > 0 && (
                      <>
                        {/* Batch fill */}
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            type="number" step="0.5" min="0"
                            value={batchFill[key] || ""}
                            onChange={(e) => setBatchFill((p) => ({ ...p, [key]: e.target.value }))}
                            placeholder='Fill all with e.g. "35"'
                            className="w-44 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
                          />
                          <button
                            onClick={() => applyBatchFill(key)}
                            className="text-xs px-3 py-1 rounded border border-gray-300 bg-white hover:border-green-700 transition-all"
                          >
                            Fill ladder
                          </button>
                        </div>

                        {/* Per-shelf width grid */}
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
                      </>
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
            <Row label="Floor" value={floor?.display_name} />
            <Row label="Range" value={zeroPad(parseInt(rangeNumber, 10))} />
            <Row label="Material type" value={materialType} />
            <Row label="Sides" value={activeSides.join(", ")} />
            {activeSides.map((side) => (
              <Row
                key={side}
                label={`Side ${side} ladders`}
                value={ladderCounts[side]}
              />
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
              {saving ? "Saving…" : "Save Range"}
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
                done ? "bg-green-700 text-white" : active ? "bg-green-700 text-white" : "bg-gray-200 text-gray-400",
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
    <div className="flex gap-2">
      <span className="text-gray-500 w-36 shrink-0">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function Back({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white hover:border-gray-400 transition-all"
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
      {label} →
    </button>
  );
}