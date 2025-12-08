import assert from "node:assert";
import type { StationId } from "im-shared/types";
import type { StationState } from "../model";
import type { Route as RawRoute } from "../types";

/** Parsed route info for a line */
export interface Route {
  /** Ordered station IDs in this route, from top to bottom */
  stations: StationId[];
}

export function resolveRoutes(stationIds: StationId[], rawRoute?: RawRoute[]): Route[] {
  const routes: RawRoute[] = (() => {
    if (rawRoute) return rawRoute;
    const first = stationIds[0];
    const last = stationIds.at(-1);
    return first && last ? [[{ from: first, to: last }]] : [];
  })();
  return routes.map((route) => ({
    stations: resolveRoute(stationIds, route),
  }));
}

/**
 * Resolve a single route spec into an ordered array of station IDs.
 */
export function resolveRoute(stationIds: StationId[], route: RawRoute): StationId[] {
  const result: StationId[] = [];
  for (const item of route) {
    if (typeof item === "string") {
      // Single station
      assert(stationIds.includes(item), `Station '${item}' not found`);
      result.push(item);
    } else {
      // Range { from, to }
      const { segment } = extractRangeStations(stationIds, item.from, item.to);
      result.push(...segment);
    }
  }

  return result;
}

export function extractRouteStations(routes: Route[], from: StationId, to: StationId): StationId[] {
  // Case 1: from and to are on the same route
  for (const route of routes) {
    const fromIdx = route.stations.indexOf(from);
    const toIdx = route.stations.indexOf(to);
    if (fromIdx !== -1 && toIdx !== -1) {
      const start = Math.min(fromIdx, toIdx);
      const end = Math.max(fromIdx, toIdx);
      const segment = route.stations.slice(start, end + 1);
      // If from > to, reverse the segment
      if (fromIdx > toIdx) {
        segment.reverse();
      }
      return segment;
    }
  }

  // Case 2: from and to are on different routes
  // Now we assume that there can be only one junction station between the two routes
  // from -> via -> to
  for (const routeA of routes) {
    const fromIdx = routeA.stations.indexOf(from);
    if (fromIdx === -1) continue;
    for (const routeB of routes) {
      const toIdx = routeB.stations.indexOf(to);
      if (toIdx === -1) continue;
      // Find junction stations
      const junction = routeA.stations.find((sid) => routeB.stations.includes(sid));
      if (!junction) continue;
      const junctionIdxA = routeA.stations.indexOf(junction);
      const junctionIdxB = routeB.stations.indexOf(junction);
      const segmentA =
        fromIdx < junctionIdxA
          ? routeA.stations.slice(fromIdx, junctionIdxA)
          : routeA.stations.slice(junctionIdxA + 1, fromIdx + 1);
      const segmentB =
        toIdx < junctionIdxB
          ? routeB.stations.slice(toIdx, junctionIdxB)
          : routeB.stations.slice(junctionIdxB + 1, toIdx + 1);
      // Combine segments
      const segment = [...segmentA, junction, ...segmentB];
      return segment;
    }
  }

  throw new Error(`Stations '${from}' and '${to}' are not connected in any route`);
}

export function extractRangeStations(
  stationIds: StationId[],
  from: StationId,
  to: StationId,
): { segment: StationId[]; start: number; end: number } {
  const fromIdx = stationIds.indexOf(from);
  const toIdx = stationIds.indexOf(to);
  assert(fromIdx !== -1, `Station '${from}' not found when extracting range stations`);
  assert(toIdx !== -1, `Station '${to}' not found when extracting range stations`);

  const start = Math.min(fromIdx, toIdx);
  const end = Math.max(fromIdx, toIdx);

  const segment = stationIds.slice(start, end + 1);

  // If from > to, reverse the segment
  if (fromIdx > toIdx) {
    segment.reverse();
  }

  return { segment, start, end };
}

/** Assign levels to stations in the routes. It continues at junctions. */
export function computeLevels(routes: Route[], stations: Map<StationId, StationState>) {
  // For now we only support upside-down Y layout.
  // In this case, the layout can be resolved in one loop.
  for (const route of routes) {
    const firstStation = route.stations[0];
    assert(firstStation);
    const baseLevel = stations.get(firstStation)?.node.level ?? 0;

    for (let i = 0; i < route.stations.length; i++) {
      const sid = route.stations[i];
      assert(sid);
      const st = stations.get(sid);
      assert(st, `Unknown station ID '${sid}' when computing levels`);
      st.node.level = baseLevel + i;
    }
  }
}
