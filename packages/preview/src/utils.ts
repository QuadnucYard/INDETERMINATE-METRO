import { type LineData, ServiceState, type StatePoint, type StationData } from "./types";

/**
 * Get line state at a given day from sparse state points
 */
export function getStateAtDay(statePoints: StatePoint[], day: number): ServiceState {
  return statePoints.findLast((p) => p.day <= day)?.state ?? ServiceState.Never;
}

/**
 * Get station Y position at a given day from sparse position points
 */
export function getStationYAtDay(station: StationData, day: number): number | undefined {
  if (day < station.existsFromDay) return undefined;

  return station.positions.findLast((p) => p.day <= day)?.y;
}

/**
 * Get station service state at a given day
 */
export function getStationStateAtDay(station: StationData, day: number): ServiceState {
  if (!station.service || station.service.length === 0) {
    return day >= station.existsFromDay ? ServiceState.Open : ServiceState.Never;
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
 * If animatedPositions is provided, use those Y values instead of static ones
 */
export function getActiveStations(
  line: LineData,
  day: number,
  stationPositions?: Map<string, number>,
) {
  const activeStations: { station: StationData; y: number; state: ServiceState }[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (const station of line.stations) {
    const stState = getStationStateAtDay(station, day);
    if (stState === ServiceState.Never || stState === ServiceState.Closed) continue;

    // Use animated position if available, otherwise fall back to static
    const y = stationPositions?.get(station.id) ?? getStationYAtDay(station, day);
    if (y === undefined) continue;

    activeStations.push({ station, y, state: stState });
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return { activeStations, minY, maxY };
}
