import type { LineIR, ServiceState, StatePoint, StationIR } from "./types";

/**
 * Get line state at a given day from sparse state points
 */
export function getStateAtDay(statePoints: StatePoint[], day: number): ServiceState {
  let state = 0 as ServiceState; // Never
  for (const pt of statePoints) {
    if (pt.day > day) break;
    state = pt.state;
  }
  return state;
}

/**
 * Get station Y position at a given day from sparse position points
 */
export function getStationYAtDay(station: StationIR, day: number): number | null {
  if (day < station.existsFromDay) return null;

  let y: number | null = null;
  for (const pt of station.positions) {
    if (pt.day > day) break;
    y = pt.y;
  }
  return y;
}

/**
 * Get station service state at a given day
 */
export function getStationStateAtDay(station: StationIR, day: number): ServiceState {
  if (!station.service || station.service.length === 0) {
    return day >= station.existsFromDay ? (1 as ServiceState) : (0 as ServiceState);
  }
  return getStateAtDay(station.service, day);
}

/**
 * Parse hex color to RGB tuple
 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = parseInt(hex.replace("#", ""), 16);
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}

/**
 * Get active stations for a line at a given day
 */
export function getActiveStations(line: LineIR, day: number) {
  const activeStations: { station: StationIR; y: number; state: ServiceState }[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (const station of line.stations) {
    const stState = getStationStateAtDay(station, day);
    if (stState === 0 || stState === 3) continue; // Never or Closed

    const y = getStationYAtDay(station, day);
    if (y === null) continue;

    activeStations.push({ station, y, state: stState });
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return { activeStations, minY, maxY };
}
