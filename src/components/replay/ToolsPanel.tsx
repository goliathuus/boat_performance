
interface Tool {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
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

const tools: Tool[] = [
  {
    id: 'ruler',
    name: 'Règle',
    icon: <RulerIcon />,
    description: 'Mesurer une distance',
  },
  // Future tools can be added here
];

interface ToolsPanelProps {
  activeTool: string | null;
  onToolChange: (toolId: string | null) => void;
}

export function ToolsPanel({ activeTool, onToolChange }: ToolsPanelProps) {
  return (
    <div className="absolute left-0 top-0 bottom-0 w-12 bg-background/95 backdrop-blur-sm border-r flex flex-col items-center py-2 gap-2 z-[1000]">
      {tools.map((tool) => (
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
      ))}
    </div>
  );
}

