import { useNavigate } from "react-router-dom";

const cards = [
  {
    title: "Shelf Scanning",
    description:
      "Create and manage shelf-reading sessions. Scan barcodes live or upload a barcode list from Excel/CSV. The analysis engine uses LC call number order to flag misshelfed, missing, or problem items.",
    to: "/morgan/scanning",
    icon: "🔫",
    ready: true,
  },
  {
    title: "Analytics",
    description:
      "Statistics and charts derived from completed scan sessions — shelf fill rates, discrepancy trends, and call-number coverage across Morgan's collections.",
    to: "/morgan/analytics",
    icon: "📊",
    ready: false,
  },
  {
    title: "Reports",
    description:
      "Export shelf-reading results as formatted reports for collection review, weeding workflows, or cataloguing follow-up.",
    to: "/morgan/reports",
    icon: "📄",
    ready: false,
  },
  {
    title: "Settings",
    description:
      "Configure Morgan-specific options: location codes, expected call-number ranges per range/section, and analysis thresholds.",
    to: "/morgan/settings",
    icon: "⚙️",
    ready: true,
  },
];

export default function MorganInventory() {
  const navigate = useNavigate();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2" style={{ color: "#1E4D2B" }}>
        Morgan Inventory
      </h1>
      <p className="text-base text-gray-500 mb-10">
        Tools for conducting and analysing physical shelf inventories at Morgan Library,
        powered by normalised LC call numbers.
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.title}
            onClick={() => card.ready && navigate(card.to)}
            className={`text-left rounded-2xl border bg-white p-7 shadow-sm transition-all group
              ${card.ready
                ? "border-gray-200 hover:border-green-700 hover:shadow-lg cursor-pointer"
                : "border-gray-100 opacity-50 cursor-not-allowed"
              }`}
          >
            <div className="text-3xl mb-4">{card.icon}</div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-lg font-bold text-gray-800 transition-colors ${card.ready ? "group-hover:text-green-800" : ""}`}>
                {card.title}
              </span>
              {!card.ready && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                  Coming soon
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">{card.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
