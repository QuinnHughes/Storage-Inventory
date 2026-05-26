const colours = {
  missing:  "bg-red-100 text-red-700",
  ghost:    "bg-purple-100 text-purple-700",
  misplaced:"bg-yellow-100 text-yellow-800",
  duplicate:"bg-orange-100 text-orange-700",
  call_number_mismatch: "bg-pink-100 text-pink-700",
};

const labels = {
  missing:  "Missing",
  ghost:    "Ghost",
  misplaced:"Misplaced",
  duplicate:"Duplicate",
  call_number_mismatch: "CN Mismatch",
};

export default function DiscrepancyBadge({ type }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colours[type] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[type] ?? type}
    </span>
  );
}
