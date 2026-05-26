import { useNavigate } from "react-router-dom";
import { useState } from "react";

const FACILITY_KEY = "mappingFacility";

const BASE_CARDS = [
  {
    title: "View Map",
    description: "Browse floor-by-floor visual plans of the facility.",
    to: "/mapping/view",
    icon: "🗺",
  },
  {
    title: "Data Entry",
    description: "Enter the physical structure — ranges, sides, ladders, and shelves.",
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

const LOCATIONS_CARD = {
  title: "Locations",
  description:
    "Manage Morgan Library location codes. Add custom codes for areas that contain items from multiple Alma locations.",
  to: "/mapping/locations",
  icon: "🏷️",
};

const DESCRIPTIONS = {
  storage: "Build and maintain a digital model of the physical storage facility.",
  morgan:  "Build and maintain a digital map of Morgan Library's physical shelving layout.",
};

export default function Mapping() {
  const navigate = useNavigate();
  const [facility, setFacility] = useState(
    () => localStorage.getItem(FACILITY_KEY) || "storage"
  );

  const changeFacility = (f) => {
    setFacility(f);
    localStorage.setItem(FACILITY_KEY, f);
  };

  const cards = facility === "morgan" ? [...BASE_CARDS, LOCATIONS_CARD] : BASE_CARDS;

  return (
    <div>
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-3xl font-bold" style={{ color: "#1E4D2B" }}>Mapping</h1>

        {/* Facility switcher */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mt-1">
          {[
            { key: "storage", label: "Storage" },
            { key: "morgan",  label: "Morgan Library" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => changeFacility(key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                facility === key
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-base text-gray-500 mb-10">{DESCRIPTIONS[facility]}</p>

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
