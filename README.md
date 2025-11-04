# Boat Tracker - Race Replay Application

A React TypeScript application for visualizing and replaying boat race tracks from CSV data. Import boat tracks, visualize them on an interactive map with wind data visualization, and replay the race with timeline controls.

## Features

### Core Functionality

- 📊 **CSV Import**: Drag & drop or click to import boat track data
- 🗺️ **Interactive Map**: Clean Carto Positron map (similar to Windy style) using Leaflet
- ⏯️ **Timeline Controls**: Play/pause, speed control (0.5x to 8x), step forward/backward
- 🎨 **Color-Coded Tracks**: Gradient-colored boat tracks based on Speed Over Ground (SOG)
- 🚤 **Boat Visualization**: Animated boat markers with orientation based on Course Over Ground (COG)

### Wind Data Visualization

- 🌹 **Wind Rose**: Circular wind direction indicator showing Apparent Wind Angle (AWA) or True Wind Angle (TWA)
  - Toggle between AWA and TWA modes
  - Color-coded arrows for each boat
  - Dynamic angle values displayed (0-180°) with automatic overlap prevention
  - Legend showing boat names and colors

- 🧭 **True Wind Direction (TWD) Arrows**: Arrows on the map showing wind direction
  - Arrows point from outside towards the boat (showing where wind comes from)
  - TWD value displayed above each arrow
  - Toggle on/off with the TWD button in the Wind Rose

### Speed Visualization

- 📊 **Speed Gauges**: Vertical speed bars for the first two boats
  - Real-time SOG (Speed Over Ground) display
  - Color-coded bars matching boat colors
  - Fixed scale (0-15 knots) for consistent visualization

### Track Visualization

- 🎨 **Gradient Color Tracks**: Boat tracks colored by speed
  - Color gradient: Blue (slow) → Cyan → Green → Yellow → Orange → Red (fast)
  - Fixed SOG range (0-15 knots) for consistent color scale across all tracks
  - Full track history or current position only

### UI Features

- 🔍 **Zoom Controls**: Zoom to fit all boats or individual boat tracks
- 📱 **Responsive UI**: Clean, modern interface with shadcn/ui components
- 🎨 **Distinct Colors**: Automatic color assignment for each boat (16 distinct colors)
- 📋 **Boat Panel**: Sidebar showing boat information and controls

## Setup

### Prerequisites

- Node.js (v18 or higher)
- npm, pnpm, or yarn

### Installation

```bash
# Install dependencies
npm install
# or
pnpm install

# Start development server
npm run dev
# or
pnpm dev
```

The application will be available at `http://localhost:5173`

### Build

```bash
npm run build
# or
pnpm build
```

### Preview Production Build

```bash
npm run preview
# or
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
- `cog`: Course over ground (degrees, 0-360)
- `twd`: True Wind Direction (degrees, 0-360)
- `awa`: Apparent Wind Angle (degrees, -180 to 180 or 0-360)
- `twa`: True Wind Angle (degrees, -180 to 180 or 0-360)
- Any other telemetry fields (will be preserved but not displayed)

### Example CSV

See `sample-data.csv` in the project root for a complete example.

```csv
timestamp,lat,lon,boat_id,boat_name,sog,cog,twd,awa,twa
2024-06-01T10:00:00Z,46.155,-1.245,BT-01,Alizé,5.8,120,180,45,50
2024-06-01T10:01:00Z,46.156,-1.244,BT-01,Alizé,5.9,121,180,46,51
2024-06-01T10:02:00Z,46.157,-1.243,BT-01,Alizé,6.1,123,180,47,52
2024-06-01T10:00:00Z,46.150,-1.240,BT-02,Mistral,5.5,118,180,42,48
2024-06-01T10:01:00Z,46.151,-1.239,BT-02,Mistral,5.6,119,180,43,49
2024-06-01T10:02:00Z,46.152,-1.238,BT-02,Mistral,5.7,121,180,44,50
```

## Usage

### Importing Data

1. Click the "Drop CSV file here" area or drag and drop a CSV file
2. The application will parse and load the data automatically
3. The map will auto-fit to show all boats

### Controlling Playback

- **Play/Pause**: Click the play/pause button or press Space
- **Speed Control**: Use the speed slider (0.5x to 8x) or preset buttons
- **Step Forward/Backward**: Use the step buttons or arrow keys
- **Time Selection**: Drag the timeline slider to jump to any time

### Wind Rose

- **Mode Selection**: Toggle between AWA (Apparent Wind Angle) and TWA (True Wind Angle)
- **TWD Display**: Toggle TWD arrows on the map with the TWD button
- **Angle Values**: Wind angles are displayed at the arrow tips (normalized to 0-180°)
- **Color Coding**: Each boat has a unique color for easy identification

### Map Controls

- **Zoom**: Use mouse wheel or zoom controls
- **Pan**: Click and drag to move the map
- **Zoom to Boats**: Click the boat name in the sidebar to zoom to that boat's track
- **Full Track**: Toggle full track display with the sidebar controls

## Keyboard Shortcuts

- **Space**: Play/Pause animation
- **← (Left Arrow)**: Step backward
- **→ (Right Arrow)**: Step forward

## Architecture

```
src/
  app/              # Main application entry points
    App.tsx         # Root component
    main.tsx        # Application entry point
  components/       # React components
    map/           # Leaflet map components
      LeafletMap.tsx      # Main map component
      HotlineTrack.tsx    # Gradient-colored track rendering
      WindRose.tsx        # Wind rose visualization
      SpeedGauge.tsx      # Speed gauge component
      SpeedGaugePair.tsx  # Speed gauge pair overlay
    timeline/      # Time controller component
    upload/        # CSV dropzone component
    sidebar/       # Boat panel sidebar
    ui/            # shadcn/ui components
    debug/         # Performance debugging tools
  domain/          # Business logic and domain types
    parsing/       # CSV parsing utilities
    tracks/        # Track computation utilities (interpolation, bounds, etc.)
    types.ts       # TypeScript type definitions
  state/           # Zustand state management
    useRaceStore.ts # Global application state
  lib/             # Utility functions
    color.ts       # Color generation and SOG color mapping
    time.ts        # Time formatting utilities
    performance.ts # Performance profiling
    utils.ts       # General utilities
  styles/          # Global styles and Tailwind config
```

## Technology Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **React Leaflet** for maps
- **Leaflet Hotline** for gradient-colored polylines
- **Zustand** for state management
- **Papa Parse** for CSV parsing

## Key Features Implementation

### Wind Data
- **Wind Rose**: Circular visualization showing wind angles relative to each boat
- **TWD Arrows**: Map-based arrows showing true wind direction
- **Angle Display**: Values normalized to 0-180° range with automatic overlap prevention

### Speed Visualization
- **Gradient Tracks**: Tracks colored by SOG using the leaflet-hotline plugin
- **Fixed Scale**: Consistent 0-15 knot range for all boats
- **Speed Gauges**: Real-time vertical bars for quick speed comparison

### Color System
- **Distinct Colors**: 16-color palette ensuring each boat has a unique, visually distinct color
- **HSL Color Space**: Consistent saturation and lightness for better contrast
- **Automatic Assignment**: Colors assigned based on boat ID hash

## Performance

- **Memoization**: Components optimized with React.memo
- **Efficient Rendering**: Only necessary components re-render on updates
- **Interpolation**: Smooth position interpolation between data points
- **Performance Profiling**: Built-in performance monitoring tools (debug mode)

## Future Enhancements

- GPX/GeoJSON import support
- Boat visibility toggles per boat
- Performance optimizations for large datasets (decimation)
- Weather overlay integration
- Backend Django integration
- Export replay as video/image
- Measurement tools (ruler, VMG calculator)
- Multiple time range selection
- Track comparison tools
- Statistics and analytics dashboard

## License

MIT
