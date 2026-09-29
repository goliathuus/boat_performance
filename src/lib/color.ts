/**
 * Palette d'identite de flotte.
 *
 * Huit teintes, ordre fixe, attribuees dans l'ordre. L'ordre EST le mecanisme
 * de securite daltonisme : il ne se reorganise pas.
 *
 * Validee contre les couleurs reelles des tuiles Esri World Dark Gray sur
 * lesquelles les traces sont dessinees : eau #232227 (contraste >= 5:1) et
 * terre #474749 (>= 3:1), ainsi que le verre fume des panneaux. Les traces
 * portent en plus un liseré sombre (ReplayMap) qui les detache du champ de
 * vent colore quand celui-ci est affiche.
 *
 * Limite connue : sur une carte, deux traces quelconques peuvent se croiser,
 * donc chaque paire compte. A ce test, la couleur seule ne separe que TROIS
 * bateaux. Au-dela, l'identite est portee par l'etiquette de nom en tete de
 * trace et par l'isolation au survol -- pas par la teinte.
 */
const FLEET_COLORS = [
  '#4c9df7', // 01 bleu
  '#ff8a4c', // 02 orange
  '#2fd6a0', // 03 aqua
  '#ffd23f', // 04 jaune
  '#ff7eb6', // 05 magenta
  '#7bd85c', // 06 vert
  '#a98bff', // 07 violet
  '#ff5a5a', // 08 rouge
];

/**
 * Attribue une couleur a un bateau.
 *
 * Prend la premiere teinte encore libre pour maximiser le contraste au sein
 * du replay courant. La couleur est ensuite stockee sur la session, donc
 * masquer ou filtrer un bateau ne repeint jamais les autres.
 *
 * Au-dela de huit bateaux les teintes se repetent : c'est assume, parce que
 * l'etiquette de nom porte deja l'identite bien avant ce seuil.
 */
export function generateBoatColor(boatId: string, usedColors: string[] = []): string {
  const usedSet = new Set(usedColors.map((c) => c.toLowerCase()));
  for (const color of FLEET_COLORS) {
    if (!usedSet.has(color.toLowerCase())) {
      return color;
    }
  }

  // Flotte plus large que la palette : index deterministe, stable pour un meme id.
  let hash = 0;
  for (let i = 0; i < boatId.length; i++) {
    hash = ((hash << 5) - hash) + boatId.charCodeAt(i);
    hash = hash & hash;
  }
  return FLEET_COLORS[Math.abs(hash) % FLEET_COLORS.length];
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
 * Rampe sequentielle de vitesse : une seule teinte, clair vers fonce.
 *
 * Remplace l'ancien arc-en-ciel, qui n'etait pas monotone, emettait des
 * composantes hors bornes et aplatissait les 20 % superieurs de la plage.
 *
 * Exclusive de la couleur d'identite : une trace porte la couleur de son
 * bateau OU sa vitesse, jamais les deux -- la rampe est bleue et entrerait
 * sinon en collision avec le slot 01.
 */
const SPEED_RAMP = [
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
];

/**
 * Couleur d'une vitesse fond (SOG) sur la rampe sequentielle.
 *
 * @param sog Speed Over Ground, en noeuds
 * @param minSog Borne basse de la plage
 * @param maxSog Borne haute de la plage
 */
export function getSogColor(sog: number, minSog: number, maxSog: number): string {
  if (!Number.isFinite(sog) || maxSog <= minSog) {
    return SPEED_RAMP[Math.floor(SPEED_RAMP.length / 2)];
  }

  const normalized = (sog - minSog) / (maxSog - minSog);
  const clamped = Math.max(0, Math.min(1, normalized));
  const index = Math.min(SPEED_RAMP.length - 1, Math.floor(clamped * SPEED_RAMP.length));
  return SPEED_RAMP[index];
}

/** Les paliers de la rampe de vitesse, du plus lent au plus rapide (pour la legende). */
export function getSpeedRampStops(): readonly string[] {
  return SPEED_RAMP;
}
