export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}
