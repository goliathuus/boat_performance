
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
    name: 'Time Ranking',
    icon: <BoatListIcon />,
    description: 'Classement selon le temps',
    isWidget: true,
  },
  {
    id: 'gateRanking',
    name: 'Gate Ranking',
    icon: <GateRankingIcon />,
    description: 'Classement selon les gates',
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
    <div className="absolute left-0 top-0 bottom-0 w-12 bg-background/95 backdrop-blur-sm border-r flex flex-col items-center py-2 gap-2 z-[1000]">
      {tools.map((tool) => {
        if (tool.isWidget) {
          // Widget: toggle open/close
          const isOpen = openWidgets.has(tool.id);
          return (
            <button
              key={tool.id}
              onClick={() => onToggleWidget(tool.id)}
              className={`p-2 rounded hover:bg-accent transition-colors ${
                isOpen
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground'
              }`}
              title={tool.description}
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
              className={`p-2 rounded hover:bg-accent transition-colors ${
                activeTool === tool.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground'
              }`}
              title={tool.description}
            >
              {tool.icon}
            </button>
          );
        }
      })}
    </div>
  );
}

