/**
 * Predefined palette of distinct colors for boats
 * These colors are chosen to be visually distinct and have good contrast
 */
const DISTINCT_COLORS = [
  'hsl(0, 70%, 50%)',    // Red
  'hsl(210, 70%, 50%)',  // Blue
  'hsl(120, 70%, 50%)',  // Green
  'hsl(30, 70%, 50%)',   // Orange
  'hsl(270, 70%, 50%)',  // Purple
  'hsl(60, 70%, 50%)',   // Yellow
  'hsl(180, 70%, 50%)',  // Cyan
  'hsl(330, 70%, 50%)',  // Pink
  'hsl(45, 70%, 50%)',   // Gold
  'hsl(150, 70%, 50%)',  // Teal
  'hsl(300, 70%, 50%)',  // Magenta
  'hsl(15, 70%, 50%)',   // Coral
  'hsl(240, 70%, 50%)',  // Dark Blue
  'hsl(90, 70%, 50%)',   // Lime
  'hsl(195, 70%, 50%)',  // Sky Blue
  'hsl(345, 70%, 50%)',  // Rose
];

/**
 * Generate a distinct color for a boat based on its ID
 * Uses a predefined palette of distinct colors to ensure visual differentiation
 */
export function generateBoatColor(boatId: string, saturation = 70, lightness = 50): string {
  // Hash boat ID to get a consistent index
  let hash = 0;
  for (let i = 0; i < boatId.length; i++) {
    hash = ((hash << 5) - hash) + boatId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use hash to select from predefined palette
  // This ensures each boat gets a distinct, visually different color
  const colorIndex = Math.abs(hash) % DISTINCT_COLORS.length;
  
  // Return the selected color from the palette
  return DISTINCT_COLORS[colorIndex];
}

/**
 * Convert HSL color to hex (for compatibility)
 */
export function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Get color based on SOG (Speed Over Ground) value
 * Échelle: bleu (lent) → vert → jaune → orange → rouge (rapide)
 * @param sog Speed Over Ground in knots
 * @param minSog Minimum SOG in dataset (for normalization)
 * @param maxSog Maximum SOG in dataset (for normalization)
 * @returns Hex color string
 */
export function getSogColor(sog: number, minSog: number, maxSog: number): string {
  if (minSog === maxSog) {
    // All boats at same speed, return middle color (yellow)
    return '#FFD700';
  }

  // Normalize SOG to 0-1 range
  const normalized = (sog - minSog) / (maxSog - minSog);
  const clamped = Math.max(0, Math.min(1, normalized));

  // Color stops: bleu → cyan → vert → jaune → orange → rouge
  if (clamped < 0.2) {
    // 0-0.2: bleu → cyan
    const t = clamped / 0.2;
    const r = Math.round(0 + (0 * t));
    const g = Math.round(100 + (255 * t));
    const b = Math.round(255 + (255 * (1 - t)));
    return `rgb(${r}, ${g}, ${b})`;
  } else if (clamped < 0.4) {
    // 0.2-0.4: cyan → vert
    const t = (clamped - 0.2) / 0.2;
    const r = Math.round(0 + (0 * t));
    const g = 255;
    const b = Math.round(255 + (0 * (1 - t)));
    return `rgb(${r}, ${g}, ${b})`;
  } else if (clamped < 0.6) {
    // 0.4-0.6: vert → jaune
    const t = (clamped - 0.4) / 0.2;
    const r = Math.round(0 + (255 * t));
    const g = 255;
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
  } else if (clamped < 0.8) {
    // 0.6-0.8: jaune → orange
    const t = (clamped - 0.6) / 0.2;
    const r = 255;
    const g = Math.round(255 + (165 * (1 - t)));
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // 0.8-1.0: orange → rouge
    const t = (clamped - 0.8) / 0.2;
    const r = 255;
    const g = Math.round(165 + (0 * (1 - t)));
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
  }
}