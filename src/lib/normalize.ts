/** Insensible aux accents et à la casse : "Éric" et "eric" doivent matcher. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
