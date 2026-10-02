
interface Tool {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  isWidget?: boolean; // true for widgets (open/close), false for tools (active/inactive)
}

// Simple ruler icon SVG
const RulerIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21.3 8.7l-5.6-5.6c-.4-.4-1-.4-1.4 0L2.7 14.7c-.4.4-.4 1 0 1.4l5.6 5.6c.4.4 1 .4 1.4 0l11.6-11.6c.4-.4.4-1 0-1.4z" />
    <path d="M14.5 4.5l2 2" />
    <path d="M16.5 6.5l2 2" />
    <path d="M18.5 8.5l2 2" />
  </svg>
);

// Boat list icon SVG
const BoatListIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

// Gate ranking icon SVG
const GateRankingIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 3v18h18" />
    <path d="M7 12l4-4 4 4 6-6" />
    <path d="M21 12v6" />
  </svg>
);

// Vent : trois lignes de courant
const WindIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 8h11a3 3 0 1 0-3-3" />
    <path d="M3 12h16a3 3 0 1 1-3 3" />
    <path d="M3 16h7" />
  </svg>
);

const tools: Tool[] = [
  {
    id: 'ruler',
    name: 'Règle',
    icon: <RulerIcon />,
    description: 'Mesurer une distance',
    isWidget: false,
  },
  {
    id: 'boatList',
    name: 'Classements',
    icon: <BoatListIcon />,
    description: 'Classements',
    isWidget: true,
  },
  {
    id: 'gateRanking',
    name: 'Classement aux portes',
    icon: <GateRankingIcon />,
    description: 'Classement aux portes',
    isWidget: true,
  },
  {
    id: 'wind',
    name: 'Vent',
    icon: <WindIcon />,
    description: 'Afficher le vent (modèle Open-Meteo)',
    isWidget: true,
  },
];

interface ToolsPanelProps {
  activeTool: string | null;
  onToolChange: (toolId: string | null) => void;
  openWidgets: Set<string>;
  onToggleWidget: (widgetId: string) => void;
}

export function ToolsPanel({ activeTool, onToolChange, openWidgets, onToggleWidget }: ToolsPanelProps) {
  return (
    <div className="glass absolute left-2 top-[3.75rem] z-[1000] flex flex-col items-center gap-1 rounded-2xl border p-1 sm:bottom-0 sm:left-0 sm:top-0 sm:w-12 sm:gap-2 sm:rounded-none sm:border-y-0 sm:border-l-0 sm:border-r sm:px-0 sm:py-2">
      {tools.map((tool) => {
        if (tool.isWidget) {
          // Widget: toggle open/close
          const isOpen = openWidgets.has(tool.id);
          return (
            <button
              key={tool.id}
              onClick={() => onToggleWidget(tool.id)}
              aria-pressed={isOpen}
              className={`grid h-10 w-10 place-items-center rounded-xl transition-colors hover:bg-accent sm:h-9 sm:w-9 sm:rounded-lg ${
                isOpen
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground'
              }`}
              title={tool.description}
              aria-label={tool.name}
            >
              {tool.icon}
            </button>
          );
        } else {
          // Tool: toggle active/inactive
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(activeTool === tool.id ? null : tool.id)}
              aria-pressed={activeTool === tool.id}
              className={`grid h-10 w-10 place-items-center rounded-xl transition-colors hover:bg-accent sm:h-9 sm:w-9 sm:rounded-lg ${
                activeTool === tool.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground'
              }`}
              title={tool.description}
              aria-label={tool.name}
            >
              {tool.icon}
            </button>
          );
        }
      })}
    </div>
  );
}

