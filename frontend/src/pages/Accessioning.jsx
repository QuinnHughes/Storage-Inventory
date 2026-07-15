import { useNavigate } from "react-router-dom";

const BASE_CARDS = [
  {
    title: "Projects",
    description: "View and manage accessioning projects.",
    to: "/accessioning/projects",
    icon: "🐢",
    ready: true,
  },
  {
    title: "Batch Printing",
    description: "Print batch labels for accessioning.",
    to: "/accessioning/batch-print",
    icon: "🐊",
    ready: true,
  },
  {
    title: "Empty Shelves",
    description: "Enter and view empty shelves for accessioning.",
    to: "/accessioning/empty-shelves",
    icon: "🦎",
    ready: true,
  },
  {
    title: "Accessioning",
    description: "Accession empty shelves and print extra labels for accessioning.",
    to: "/accessioning/accession",
    icon: "🐸",
    ready: true,
  },
];

export default function Accessioning() {
  const navigate = useNavigate();
  const cards = BASE_CARDS;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2" style={{ color: "#1E4D2B" }}>
        Accessioning
      </h1>
      <p className="text-base text-gray-500 mb-10">
        Tools for accessioning and projects
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
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl leading-none" aria-hidden="true">
                {card.icon}
              </span>
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