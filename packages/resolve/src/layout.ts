import assert from "node:assert";
import { ServiceState, type StationId, type Vec2 } from "im-shared/types";
import * as _ from "radash";
import type { StationSnapshot } from "./model";

/**
 * Calculate station positions, reserving space for all stations between first and last active.
 * This ensures deferred stations (in fullStations but not yet open) have positions reserved.
 *
 * @param routes - Array of active routes (each route is an array of station IDs, in top-bottom order)
 * @param stations - Map of station ID to their snapshot
 * @param x - Base x position for the line
 * @param topY - Top y position
 * @param bottomY - Bottom y position
 * @param branchOffset - Horizontal offset between branches
 */
export function calculateStationPositions(
  routes: StationId[][],
  stations: Map<StationId, StationSnapshot>,
  x: number,
  topY: number,
  bottomY: number,
  branchOffset = 50,
): Map<StationId, Vec2> {
  // Stations with the same level are aligned horizontally.
  // For each route, we check if there are stations with the same level in other routes.
  // If any, we align these routes horizontally by adjusting their x positions.

  const positions = new Map<StationId, Vec2>();

  // We have computed levels for all stations in the model.
  // Now we need to assign positions based on levels.
  const levelCounts = new Map<number, number>();
  for (const [sid, { state }] of stations.entries()) {
    if (state === ServiceState.Open || state === ServiceState.Suspended) {
      const level = stations.get(sid)?.level ?? -1;
      levelCounts.set(level, levelCounts.get(level) ?? 0 + 1);
    }
  }
  const minLevel = Math.min(...levelCounts.keys());
  const maxLevel = Math.max(...levelCounts.keys());
  const totalLevels = maxLevel - minLevel + 1;
  const levelHeight = totalLevels <= 1 ? 0 : (bottomY - topY) / (totalLevels - 1);

  let pendingRoutes = routes.map((r) =>
    r.filter((sid) => {
      const state = stations.get(sid)?.state;
      return state === ServiceState.Open || state === ServiceState.Suspended;
    }),
  );

  while (pendingRoutes.length > 0) {
    const route = pendingRoutes.shift();
    if (!route || route.length === 0) continue;
    // Collect levels in this route
    const levelSet = new Set<number>(route.map((sid) => stations.get(sid)?.level ?? -1));

    // Get all routes that conflict with this one (share levels)
    // Then remove them from pendingRoutes
    const [conflictedRoutes, remainingRoutes] = _.fork(pendingRoutes, (r) => {
      return r.slice(1).some((sid) => {
        const level = stations.get(sid)?.level;
        return level !== undefined && levelSet.has(level);
      });
    });
    conflictedRoutes.unshift(route); // include current route

    // For each level in the conflicted routes, assign x positions
    for (let i = 0; i < conflictedRoutes.length; i++) {
      const r = conflictedRoutes[i];
      assert(r);
      const xOffset = (i - (conflictedRoutes.length - 1) / 2) * branchOffset;

      for (const sid of r) {
        if (positions.has(sid)) continue; // already assigned
        const level = stations.get(sid)?.level;
        assert(level !== undefined);
        const y = topY + (level - minLevel) * levelHeight;
        positions.set(sid, { x: x + xOffset, y });
      }
    }

    pendingRoutes = remainingRoutes;
  }

  return positions;
}
