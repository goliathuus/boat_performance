# Boat Tracker - Race Replay Application

A React TypeScript application for visualizing and replaying boat race tracks from CSV data. Import boat tracks, visualize them on an interactive map, and replay the race with timeline controls.

## Features

- 📊 **CSV Import**: Drag & drop or click to import boat track data
- 🗺️ **Interactive Map**: Clean Carto Positron map (similar to Windy style) using Leaflet
- ⏯️ **Timeline Controls**: Play/pause, speed control (0.5x to 8x), step forward/backward
- 🎨 **Visualization**: Color-coded boat tracks with animated markers
- 🔍 **Zoom Controls**: Zoom to fit all boats or individual boat tracks
- 📱 **Responsive UI**: Clean, modern interface with shadcn/ui components

## Setup

### Prerequisites

- Node.js (v18 or higher)
- pnpm (or npm/yarn)

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The application will be available at `http://localhost:5173`

### Build

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## CSV Format

CSV files must contain the following columns (case-insensitive):

### Required Columns

- `timestamp`: ISO 8601 format (e.g., `2024-06-01T10:00:00Z`) or epoch milliseconds
- `lat`: Latitude in decimal degrees (range: -90 to 90)
- `lon`: Longitude in decimal degrees (range: -180 to 180)
- `boat_id`: Unique identifier for the boat (string)

### Optional Columns

- `boat_name`: Display name for the boat (defaults to `boat_id` if not provided)
- `sog`: Speed over ground (knots)
- `cog`: Course over ground (degrees)
- Any other telemetry fields (will be preserved but not displayed)

### Example CSV

See `sample-data.csv` in the project root for a complete example.

```csv
timestamp,lat,lon,boat_id,boat_name,sog,cog
2024-06-01T10:00:00Z,46.155,-1.245,BT-01,Alizé,5.8,120
2024-06-01T10:01:00Z,46.156,-1.244,BT-01,Alizé,5.9,121
2024-06-01T10:02:00Z,46.157,-1.243,BT-01,Alizé,6.1,123
2024-06-01T10:00:00Z,46.150,-1.240,BT-02,Mistral,5.5,118
2024-06-01T10:01:00Z,46.151,-1.239,BT-02,Mistral,5.6,119
2024-06-01T10:02:00Z,46.152,-1.238,BT-02,Mistral,5.7,121
```

## Keyboard Shortcuts

- **Space**: Play/Pause animation
- **← (Left Arrow)**: Step backward
- **→ (Right Arrow)**: Step forward

## Architecture

```
src/
  app/              # Main application entry points
  components/       # React components
    map/           # Leaflet map component
    timeline/      # Time controller component
    upload/        # CSV dropzone component
    sidebar/       # Boat panel sidebar
    ui/            # shadcn/ui components
  domain/          # Business logic and domain types
    parsing/       # CSV parsing utilities
    tracks/       # Track computation utilities
  state/           # Zustand state management
  lib/             # Utility functions (time, color)
  styles/          # Global styles and Tailwind config
```

## Technology Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **React Leaflet** for maps
- **Zustand** for state management
- **Papa Parse** for CSV parsing

## Future Enhancements

- GPX/GeoJSON import support
- Boat visibility toggles per boat
- Performance optimizations for large datasets (decimation)
- Weather overlay integration
- Backend Django integration
- Export replay as video/image
- Measurement tools (ruler, VMG calculator)

## License

MIT
