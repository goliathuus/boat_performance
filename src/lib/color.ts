/**
 * Ultra high-contrast palette for boat traces.
 * Ordered so first boats are immediately distinguishable at a glance.
 */
const HIGH_CONTRAST_COLORS = [
  '#0057ff', // vivid blue
  '#00a651', // vivid green
  '#ff1f1f', // vivid red
  '#ff2fa3', // vivid pink
  '#8b4513', // brown
  '#00c8ff', // cyan
  '#ffd400', // yellow
  '#7a00ff', // purple
  '#ff7a00', // orange
  '#1a1a1a', // black
  '#9cff00', // lime
  '#00ffd5', // turquoise
  '#ff004d', // rose red
  '#6a4c93', // deep violet
  '#3d5a40', // dark green
];

/**
 * Generate a distinct color for a boat.
 * - If usedColors are provided, prefers the first unused high-contrast color.
 * - Otherwise uses a deterministic hash for stable color assignment.
 */
export function generateBoatColor(
  boatId: string,
  _saturation = 70,
  _lightness = 50,
  usedColors: string[] = []
): string {
  // Prefer sequential first-unused color to maximize contrast within the current replay.
  const usedSet = new Set(usedColors.map((c) => c.toLowerCase()));
  for (const color of HIGH_CONTRAST_COLORS) {
    if (!usedSet.has(color.toLowerCase())) {
      return color;
    }
  }

  // Fallback for very large fleets: deterministic hash index.
  let hash = 0;
  for (let i = 0; i < boatId.length; i++) {
    hash = ((hash << 5) - hash) + boatId.charCodeAt(i);
    hash = hash & hash;
  }
  return HIGH_CONTRAST_COLORS[Math.abs(hash) % HIGH_CONTRAST_COLORS.length];
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