import {
  type ActiveLineStations,
  type KeyedArray,
  type KeyedState,
  type LineData,
  type PreviewData,
  type RouteData,
  ServiceState,
  type StationData,
  type StationPositionRefs,
  type Vec2,
} from "./types";

/**
 * Get line state at a given day from sparse state points
 */
export function getStateAtDay(statePoints: KeyedState[], day: number): ServiceState {
  return statePoints.findLast((p) => p.day <= day)?.state ?? ServiceState.Never;
}

/**
 * Get ridership count for a line at a given day
 */
export function getRidershipAtDay(line: LineData, day: number): number {
  const firstDay = line.firstDay ?? 0;
  return line.ridership[day - firstDay] ?? 0;
}

/**
 * Get ridership count for the entire system at a given day
 */
export function getTotalRidershipAtDay(data: PreviewData, day: number): number {
  return data.totalRiderships[day] ?? 0;
}

/**
 * Get station position (x, y) at a given day from sparse position points
 */
export function getStationPositionAtDay(station: StationData, day: number): Vec2 | undefined {
  return station.positions.findLast((p) => p.day <= day);
}

/**
 * Get station service state at a given day
 */
export function getStationStateAtDay(station: StationData, day: number): ServiceState {
  return getStateAtDay(station.service, day);
}

/**
 * Get route segments at a given day from sparse route points
 */
export function getRouteSegmentsAtDay(
  routePoints: KeyedArray<{ value: RouteData[] }>,
  day: number,
): RouteData[] {
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
  stationPositions?: StationPositionRefs,
): ActiveLineStations {
  const activeStations: { station: StationData; pos: Vec2; state: ServiceState }[] = [];

  // TODO: since we do not handle routes, we simply find min/max Y from stations
  let firstPos = { x: 0, y: Infinity };
  let lastPos = { x: 0, y: -Infinity };

  for (const station of line.stations) {
    const stState = getStationStateAtDay(station, day);
    if (stState === ServiceState.Never || stState === ServiceState.Closed) continue;

    // Use animated position if available
    const pos = stationPositions?.get(station.id)?.val;
    if (!pos) continue;

    activeStations.push({ station, pos, state: stState });
    if (pos.y < firstPos.y) firstPos = pos;
    if (pos.y > lastPos.y) lastPos = pos;
  }

  return { activeStations, firstPos, lastPos };
}
