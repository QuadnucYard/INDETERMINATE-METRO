import {
  type ActiveLineStations,
  type KeyedArray,
  type KeyedState,
  type LineData,
  ServiceState,
  type StationData,
  type StationId,
  type Vec2,
} from "./types";

/**
 * Get line state at a given day from sparse state points
 */
export function getStateAtDay(statePoints: KeyedState[], day: number): ServiceState {
  return statePoints.findLast((p) => p.day <= day)?.state ?? ServiceState.Never;
}

/**
 * Get station position (x, y) at a given day from sparse position points
 */
export function getStationPositionAtDay(station: StationData, day: number): Vec2 | undefined {
  if (day < station.existsFromDay) return undefined;

  return station.positions.findLast((p) => p.day <= day);
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
 * Get route segments at a given day from sparse route points
 */
export function getRouteSegmentsAtDay(
  routePoints: KeyedArray<{ value: StationId[][] }>,
  day: number,
): StationId[][] {
  const found = routePoints.findLast((p) => p.day <= day);
  return found?.value ?? [];
}

/**
 * Get active stations for a line at a given day
 * If animatedPositions is provided, use those x,y values instead of static ones
 */
export function getActiveStations(
  line: LineData,
  day: number,
  stationPositions?: Map<StationId, Vec2>,
): ActiveLineStations {
  const activeStations: { station: StationData; pos: Vec2; state: ServiceState }[] = [];

  // TODO: since we do not handle routes, we simply find min/max Y from stations
  let firstPos = { x: 0, y: Infinity };
  let lastPos = { x: 0, y: -Infinity };

  for (const station of line.stations) {
    const stState = getStationStateAtDay(station, day);
    if (stState === ServiceState.Never || stState === ServiceState.Closed) continue;

    // Use animated position if available
    const pos = stationPositions?.get(station.id);
    if (!pos) continue;

    activeStations.push({ station, pos, state: stState });
    if (pos.y < firstPos.y) firstPos = pos;
    if (pos.y > lastPos.y) lastPos = pos;
  }

  return { activeStations, firstPos, lastPos };
}
