import { ServiceState } from "./ir";

export function calculateStationPositions(
  allStations: string[],
  stationStates: Map<string, ServiceState>,
  topY: number,
  bottomY: number,
): Map<string, number> {
  const activeIndices: number[] = [];
  for (let i = 0; i < allStations.length; i++) {
    const stationId = allStations[i];
    if (!stationId) continue;
    const state = stationStates.get(stationId);
    if (state === ServiceState.Open || state === ServiceState.Suspended) {
      activeIndices.push(i);
    }
  }

  const positions = new Map<string, number>();
  if (activeIndices.length === 0) return positions;

  const firstIdx = activeIndices[0];
  const lastIdx = activeIndices[activeIndices.length - 1];

  if (firstIdx === undefined || lastIdx === undefined) return positions;

  if (firstIdx === lastIdx) {
    const sid = allStations[firstIdx];
    if (sid) positions.set(sid, topY);
    return positions;
  }

  const totalSteps = lastIdx - firstIdx;
  const height = bottomY - topY;

  for (const idx of activeIndices) {
    const y = topY + (idx - firstIdx) * (height / totalSteps);
    const sid = allStations[idx];
    if (sid) positions.set(sid, y);
  }

  return positions;
}
