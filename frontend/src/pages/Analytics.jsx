import { useNavigate } from "react-router-dom";

const cards = [
  {
    title: "Upload",
    description: "Import Alma analytics exports (CSV or Excel). Records are upserted by barcode and automatically routed to the correct collection by location code.",
    to: "/analytics/upload",
    icon: "📤",
  },
  {
    title: "Records",
    description: "Search every imported ILS record by any field. Filter by collection, location, status, or lifecycle. Edit individual records in-place.",
    to: "/analytics/records",
    icon: "🔍",
  },
  {
    title: "Jobs",
    description: "Scheduled and batch processing jobs for analytics data.",
    to: "/analytics/jobs",
    icon: "⚙️",
  },
];

export default function Analytics() {
  const navigate = useNavigate();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2" style={{ color: "#1E4D2B" }}>Analytics</h1>
      <p className="text-base text-gray-500 mb-10">
        Central hub for Alma analytics data. Uploads here are shared across all collection tools.
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
