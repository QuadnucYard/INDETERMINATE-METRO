import assert from "node:assert";
import { ServiceState, type StationId, type Vec2 } from "im-shared/types";

/**
 * Calculate station positions, reserving space for all stations between first and last active.
 * This ensures deferred stations (in fullStations but not yet open) have positions reserved.
 */
export function calculateStationPositions(
  allStations: StationId[],
  stationStates: Map<StationId, ServiceState>,
  x: number,
  topY: number,
  bottomY: number,
): Map<StationId, Vec2> {
  // Find indices of all active (Open or Suspended) stations
  const activeIndices: number[] = [];
  for (let i = 0; i < allStations.length; i++) {
    const stationId = allStations[i];
    assert(stationId);
    const state = stationStates.get(stationId);
    if (state === ServiceState.Open || state === ServiceState.Suspended) {
      activeIndices.push(i);
    }
  }

  const positions = new Map<StationId, Vec2>();
  if (activeIndices.length === 0) return positions;

  const firstIdx = activeIndices[0];
  const lastIdx = activeIndices[activeIndices.length - 1];

  if (firstIdx === undefined || lastIdx === undefined) return positions;

  if (firstIdx === lastIdx) {
    const sid = allStations[firstIdx];
    if (sid) positions.set(sid, { x, y: topY });
    return positions;
  }

  const totalSteps = lastIdx - firstIdx;
  const height = bottomY - topY;

  for (const idx of activeIndices) {
    const y = topY + (idx - firstIdx) * (height / totalSteps);
    const sid = allStations[idx];
    if (sid) positions.set(sid, { x, y });
  }

  return positions;
}
