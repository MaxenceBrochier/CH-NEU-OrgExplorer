export const MM_PER_PX = 25.4 / 96;
export const A0_HEIGHT_MM = 1189;
export const A0_WIDTH_MM = 841;
// Caractéristiques du plotter : laize bornée, longueur de tirage quasi libre.
export const PLOTTER_MIN_WIDTH_MM = 78.99;
export const PLOTTER_MAX_WIDTH_MM = 914.4;
export const PLOTTER_MIN_LENGTH_MM = 140;
export const PLOTTER_MAX_LENGTH_MM = 91000;
// Un PDF standard ne dépasse pas 200 pouces (5080 mm) de côté : au-delà le fichier est vide ou refusé.
// On reste légèrement sous la limite pour éviter les échecs au ras du seuil.
export const PDF_MAX_SIDE_MM = 5000;

export function pxToMm(px: number): number {
  return px * MM_PER_PX;
}

export function mmToPx(mm: number): number {
  return mm / MM_PER_PX;
}

export interface PrintBlock {
  key: string;
  width: number;
  height: number;
}

export interface PrintOptions {
  /** Laize : largeur du papier dans le plotter (78,99 → 914,40 mm). */
  paperWidthMm: number;
  /** Longueur de tirage le long du rouleau (140 mm → limite PDF). */
  maxLengthMm: number;
  /** L'organigramme est couché le long du rouleau : sa hauteur tient dans la laize. */
  rotate: boolean;
  marginMm: number;
  gapMm: number;
  /** Bandeau (légende, date) réservé sous l'organigramme. */
  footerMm: number;
  minScale: number;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  paperWidthMm: PLOTTER_MAX_WIDTH_MM,
  maxLengthMm: 3000,
  rotate: true,
  marginMm: 10,
  gapMm: 15,
  footerMm: 22,
  minScale: 0.3,
};

export interface PrintPlan {
  scale: number;
  /** Dimension en travers du rouleau (≤ laize). */
  pageWidthMm: number;
  /** Dimension le long du rouleau. */
  pageHeightMm: number;
  /** Clés des blocs, regroupées par feuille. */
  pages: string[][];
  /** L'échelle nécessaire est descendue sous le seuil de lisibilité. */
  overflow: boolean;
}

/**
 * Répartit les arbres sur des bandes de rouleau : la hauteur de l'organigramme est bornée par
 * la laize, sa largeur court le long du rouleau, échelle unique pour toutes les feuilles.
 */
export function planPrint(blocks: PrintBlock[], options: PrintOptions): PrintPlan {
  const { paperWidthMm, maxLengthMm, rotate, marginMm, gapMm, footerMm, minScale } = options;
  const acrossMm = Math.min(paperWidthMm, PLOTTER_MAX_WIDTH_MM);
  const alongMm = Math.min(maxLengthMm, PDF_MAX_SIDE_MM);

  // Couché, la hauteur du graphe traverse le rouleau et sa largeur file le long du rouleau.
  const chartHeightPx = mmToPx(Math.max(1, (rotate ? acrossMm : alongMm) - 2 * marginMm - footerMm));
  const chartWidthPx = mmToPx(Math.max(1, (rotate ? alongMm : acrossMm) - 2 * marginMm));
  const gapPx = mmToPx(gapMm);

  if (blocks.length === 0) {
    return {
      scale: 1,
      pageWidthMm: 2 * marginMm,
      pageHeightMm: 2 * marginMm,
      pages: [],
      overflow: false,
    };
  }

  const tallest = Math.max(...blocks.map((block) => block.height));
  const widest = Math.max(...blocks.map((block) => block.width));
  const needed = Math.min(1, chartHeightPx / tallest, chartWidthPx / widest);
  // Pas de plancher : mieux vaut un texte petit qu'un arbre coupé au bord de la feuille.
  const scale = Math.max(0.05, needed);

  const pages: string[][] = [];
  let current: string[] = [];
  let currentWidth = 0;

  for (const block of blocks) {
    const width = block.width * scale;
    const nextWidth = current.length === 0 ? width : currentWidth + gapPx + width;

    if (current.length > 0 && nextWidth > chartWidthPx) {
      pages.push(current);
      current = [];
      currentWidth = 0;
    }

    currentWidth = current.length === 0 ? width : currentWidth + gapPx + width;
    current.push(block.key);
  }
  if (current.length > 0) pages.push(current);

  const byKey = new Map(blocks.map((block) => [block.key, block]));
  const usedWidthPx = Math.max(
    ...pages.map((page) =>
      page.reduce(
        (total, key, index) => total + (index > 0 ? gapPx : 0) + byKey.get(key)!.width * scale,
        0,
      ),
    ),
  );
  const usedHeightPx = Math.max(
    ...pages.map((page) => Math.max(...page.map((key) => byKey.get(key)!.height * scale))),
  );

  const chartWidthMm = pxToMm(usedWidthPx) + 2 * marginMm;
  const chartHeightMm = pxToMm(usedHeightPx) + 2 * marginMm + footerMm;

  return {
    scale,
    // Tailles de page en millimètres entiers : certains moteurs « Save as PDF » et pilotes
    // rejettent une taille de page fractionnaire (ex. 914.4mm) et produisent un PDF vide.
    pageWidthMm: Math.max(1, Math.floor(Math.min(acrossMm, Math.ceil(rotate ? chartHeightMm : chartWidthMm)))),
    pageHeightMm: Math.max(1, Math.floor(Math.min(alongMm, Math.ceil(rotate ? chartWidthMm : chartHeightMm)))),
    pages,
    overflow: needed < minScale,
  };
}
