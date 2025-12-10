import { lerp, midpoint } from "im-shared/math";
import { getStationPositionAtDay } from "./keyframe";
import type {
  LineData,
  LineId,
  PreviewData,
  StationData,
  StationId,
  StationPositionRefs,
  Vec2,
} from "./types";

interface AnimatedPosition {
  current: Vec2;
  target: Vec2;
  start: Vec2;
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
  private positions = new Map<LineId, Map<StationId, AnimatedPosition>>();

  /**
   * Update target positions based on current day
   * Returns animated positions for rendering
   */
  public update(
    stationPositions: StationPositionRefs,
    data: PreviewData,
    currentDay: number,
    now: number,
  ) {
    const day = Math.floor(currentDay);

    for (const [lineId, line] of Object.entries(data.lines)) {
      const linePositions = this.getOrCreateLineMap(lineId);
      this.updateLinePositions(linePositions, line, day, now);
      for (const [sid, anim] of linePositions.entries()) {
        const posRef = stationPositions.get(sid);
        if (posRef) {
          posRef.val = anim.current;
        } else {
          stationPositions.set(sid, { val: anim.current });
        }
      }
    }
  }

  private updateLinePositions(
    linePositions: Map<StationId, AnimatedPosition>,
    line: LineData,
    day: number,
    now: number,
  ) {
    // First pass: collect all current target positions for insertion point calculation
    const stationTargets: StationTarget[] = [];
    for (let i = 0; i < line.stations.length; i++) {
      const station = line.stations[i];
      if (!station) continue;

      // Get position from data (includes x computed during data generation)
      const pos = getStationPositionAtDay(station, day);
      if (pos !== undefined) {
        stationTargets.push({ station, target: pos, index: i });
      } else {
        // Station not active at this day - remove from animations
        linePositions.delete(station.id);
      }
    }

    // Second pass: animate positions
    for (const { station, target } of stationTargets) {
      const anim = linePositions.get(station.id);

      if (!anim) {
        // First time seeing this station - animate from insertion point
        const insertionPos = findInsertionPoint(station.id, stationTargets, linePositions);
        linePositions.set(station.id, {
          current: insertionPos,
          target,
          start: insertionPos,
          startTime: now,
          duration: INSERTION_DURATION,
        });
      } else if (anim.target.y !== target.y || anim.target.x !== target.x) {
        // Target changed - start new animation
        anim.start = anim.current;
        anim.target = target;
        anim.startTime = now;
        anim.duration = TRANSITION_DURATION;
      } else {
        // Continue existing animation or stay at target
        const elapsed = now - anim.startTime;
        if (elapsed < anim.duration) {
          // Animate with easing
          const t = elapsed / anim.duration;
          const eased = easeOutCubic(t);
          anim.current = lerp(anim.start, anim.target, eased);
        } else {
          anim.current = anim.target;
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

  private getOrCreateLineMap(lineId: LineId): Map<StationId, AnimatedPosition> {
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

interface StationTarget {
  station: StationData;
  target: Vec2;
  index: number;
}

/**
 * Find the insertion point Y for a group of newly appearing stations.
 * Returns the Y position between existing animated stations based on their order.
 */
function findInsertionPoint(
  stationId: StationId,
  stationTargets: readonly StationTarget[],
  linePositions: ReadonlyMap<StationId, AnimatedPosition>,
): Vec2 {
  // Find the index for the requested station
  const current = stationTargets.find((st) => st.station.id === stationId);
  if (current === undefined) {
    throw new Error(`Station ID '${stationId}' not found in targets for insertion point`);
  }

  const currentIndex = current.index;

  // Find all existing animated stations with indices and positions
  const existing: { readonly index: number; readonly pos: Vec2 }[] = [];
  for (const { station, index } of stationTargets) {
    const existingAnim = linePositions.get(station.id);
    if (existingAnim) {
      existing.push({ index, pos: existingAnim.current });
    }
  }
  // Sort by index
  existing.sort((a, b) => a.index - b.index);

  // If current index is before the first existing, return first Y
  const first = existing[0];
  if (first && currentIndex <= first.index) {
    return first.pos;
  }
  // If current index is after the last existing, return last Y
  const last = existing.at(-1);
  if (last && currentIndex >= last.index) {
    return last.pos;
  }

  // Otherwise, it's between two existing stations: find bounding pair and return midpoint
  for (let i = 1; i < existing.length; i++) {
    const left = existing[i - 1];
    const right = existing[i];
    if (!left || !right) continue;
    if (currentIndex > left.index && currentIndex < right.index) {
      return midpoint(left.pos, right.pos);
    }
  }

  // Fallback if something unexpected occurred
  return current.target;
}

/**
 * Cubic ease-out for smooth deceleration
 */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}
