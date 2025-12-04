import type { LineData, PreviewData, StationData } from "./types";
import { getStationYAtDay } from "./utils";

interface AnimatedPosition {
  currentY: number;
  targetY: number;
  startY: number;
  startTime: number;
  duration: number;
}

/** ms for position transitions */
const TRANSITION_DURATION = 300;
/** ms for new station insertion animation */
const INSERTION_DURATION = 300;

/**
 * Manages smooth transitions for station positions independent of day progress
 */
export class PositionAnimator {
  // lineId -> stationId -> AnimatedPosition
  private positions = new Map<string, Map<string, AnimatedPosition>>();

  /**
   * Update target positions based on current day
   * Returns animated positions for rendering
   */
  public update(
    data: PreviewData,
    currentDay: number,
    now: number,
  ): Map<string, Map<string, number>> {
    const day = Math.floor(currentDay);

    const result = new Map<string, Map<string, number>>();

    for (const [lineId, line] of Object.entries(data.lines)) {
      const linePositions = this.getOrCreateLineMap(lineId);
      this.updateLinePositions(linePositions, line, day, now);
      const resultLine = new Map(
        linePositions.entries().map(([stationId, anim]) => [stationId, anim.currentY]),
      );
      result.set(lineId, resultLine);
    }

    return result;
  }

  private updateLinePositions(
    linePositions: Map<string, AnimatedPosition>,
    line: LineData,
    day: number,
    now: number,
  ) {
    // First pass: collect all current target positions for insertion point calculation
    const stationTargets: { station: StationData; targetY: number; index: number }[] = [];
    for (let i = 0; i < line.stations.length; i++) {
      const station = line.stations[i];
      if (!station) continue;

      const targetY = getStationYAtDay(station, day);
      if (targetY !== undefined) {
        stationTargets.push({ station, targetY, index: i });
      } else {
        // Station not active at this day - remove from animations
        linePositions.delete(station.id);
      }
    }

    // Second pass: animate positions
    for (const { station, targetY } of stationTargets) {
      const anim = linePositions.get(station.id);

      if (!anim) {
        // First time seeing this station - animate from insertion point
        const insertionY = findInsertionPoint(station.id, stationTargets, linePositions);
        linePositions.set(station.id, {
          currentY: insertionY,
          targetY,
          startY: insertionY,
          startTime: now,
          duration: INSERTION_DURATION,
        });
      } else if (anim.targetY !== targetY) {
        // Target changed - start new animation
        anim.startY = anim.currentY;
        anim.targetY = targetY;
        anim.startTime = now;
        anim.duration = TRANSITION_DURATION;
      } else {
        // Continue existing animation or stay at target
        const elapsed = now - anim.startTime;
        if (elapsed < anim.duration) {
          // Animate with easing
          const t = elapsed / anim.duration;
          const eased = easeOutCubic(t);
          anim.currentY = anim.startY + (anim.targetY - anim.startY) * eased;
        } else {
          anim.currentY = anim.targetY;
        }
      }
    }
  }

  /**
   * Check if any animations are currently active
   */
  public isAnimating(now: number): boolean {
    for (const lineMap of this.positions.values()) {
      for (const anim of lineMap.values()) {
        if (now - anim.startTime < anim.duration) {
          return true;
        }
      }
    }
    return false;
  }

  private getOrCreateLineMap(lineId: string): Map<string, AnimatedPosition> {
    let map = this.positions.get(lineId);
    if (!map) {
      map = new Map();
      this.positions.set(lineId, map);
    }
    return map;
  }

  /**
   * Clear all animated positions (also resets lastDay)
   */
  public clear() {
    this.positions.clear();
  }
}

/**
 * Find the insertion point Y for a group of newly appearing stations.
 * Returns the Y position between existing animated stations based on their order.
 */
function findInsertionPoint(
  stationId: string,
  stationTargets: { station: StationData; targetY: number; index: number }[],
  linePositions: Map<string, AnimatedPosition>,
): number {
  // Find the index for the requested station
  const current = stationTargets.find((st) => st.station.id === stationId);
  if (current === undefined) {
    throw new Error(`Station ID '${stationId}' not found in targets for insertion point`);
  }

  const currentIndex = current.index;

  // Find all existing animated stations with indices and Y
  const existing: { index: number; y: number }[] = [];
  for (const { station, index } of stationTargets) {
    const existingAnim = linePositions.get(station.id);
    if (existingAnim) {
      existing.push({ index, y: existingAnim.currentY });
    }
  }
  // Sort by index
  existing.sort((a, b) => a.index - b.index);

  // If current index is before the first existing, return first Y
  const first = existing[0];
  if (first && currentIndex <= first.index) {
    return first.y;
  }
  // If current index is after the last existing, return last Y
  const last = existing.at(-1);
  if (last && currentIndex >= last.index) {
    return last.y;
  }

  // Otherwise, it's between two existing stations: find bounding pair and return midpoint
  for (let i = 1; i < existing.length; i++) {
    const left = existing[i - 1];
    const right = existing[i];
    if (!left || !right) continue;
    if (currentIndex > left.index && currentIndex < right.index) {
      return (left.y + right.y) / 2;
    }
  }

  // Fallback if something unexpected occurred
  return current.targetY;
}

/**
 * Cubic ease-out for smooth deceleration
 */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}
