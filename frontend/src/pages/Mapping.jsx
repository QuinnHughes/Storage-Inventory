import { useNavigate } from "react-router-dom";

const cards = [
  {
    title: "View Map",
    description: "Browse floor-by-floor visual plans of the storage facility.",
    to: "/mapping/view",
    icon: "🗺",
  },
  {
    title: "Data Entry",
    description: "Enter the physical structure of the building — ranges, sides, ladders, and shelves.",
    to: "/mapping/data-entry",
    icon: "📋",
  },
  {
    title: "Range List",
    description: "View, edit, or delete previously entered ranges by floor.",
    to: "/mapping/ranges",
    icon: "📂",
  },
  {
    title: "Search",
    description: "Look up any location by call number prefix to see its structure and totals.",
    to: "/mapping/search",
    icon: "🔍",
  },
  {
    title: "Map Editor",
    description: "Build an interactive top-down floor plan with scaled, snappable range shapes.",
    to: "/mapping/editor",
    icon: "✏️",
  },
];

export default function Mapping() {
  const navigate = useNavigate();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2" style={{ color: "#1E4D2B" }}>Mapping</h1>
      <p className="text-base text-gray-500 mb-10">
        Build and maintain a digital model of the physical storage facility.
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.title}
            onClick={() => navigate(card.to)}
            className="text-left rounded-2xl border border-gray-200 bg-white hover:border-green-700 hover:shadow-lg cursor-pointer p-7 shadow-sm transition-all group"
          >
            <div className="text-3xl mb-4">{card.icon}</div>
            <div className="text-lg font-bold text-gray-800 mb-2 group-hover:text-green-800 transition-colors">
              {card.title}
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">{card.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}