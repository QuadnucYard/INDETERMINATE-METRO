import { pairs } from "../itertools";
import { getRouteSegmentsAtDay, getStateAtDay, getStationStateAtDay } from "../keyframe";
import {
  type LineData,
  type LineId,
  type PositionRefMap,
  type PreviewData,
  ServiceState,
  type StationData,
  type StationId,
} from "../types";
import { headKey } from "../utils";
import type { LineEmitterConfig, PointEmitterConfig } from "./config";
import { LineEmitter, PointEmitter } from "./emitter";
import { EMITTER_CONFIGS as EMISSIONS } from "./presets";
import type { BlossomSystem } from "./system";

export class BlossomSchedule {
  private lastEventDay: number = -1;
  // Track states for detecting changes
  private lastLineStates = new Map<LineId, ServiceState>();
  private lastStationStates = new Map<StationId, ServiceState>();
  private lastEdgeStates = new Map<LineId, Map<string, ServiceState>>();

  constructor(
    private blossomSystem: BlossomSystem,
    private positionMap: PositionRefMap,
  ) {}

  public update(data: PreviewData, day: number) {
    if (day === this.lastEventDay) return;

    this.lastEventDay = day;

    // Check for line state changes
    for (const line of Object.values(data.lines)) {
      // Route-segment-level events
      if (!this.lastEdgeStates.has(line.id)) {
        this.lastEdgeStates.set(line.id, new Map());
      }
      const lastEdgeStates = this.lastEdgeStates.get(line.id);
      if (!lastEdgeStates) continue;

      const seenEdges = new Set<string>();
      for (const route of getRouteSegmentsAtDay(line.routePoints, day)) {
        for (const [s1, s2] of pairs(route.stations)) {
          const edgeId = `${s1}--${s2}`;
          seenEdges.add(edgeId);
          const prevState = lastEdgeStates.get(edgeId) ?? ServiceState.Never;
          const curState = route.state;

          if (curState === prevState) continue;

          lastEdgeStates.set(edgeId, curState);
          this.applySegmentEvent(line, s1, s2, prevState, curState);
        }
      }
      // View unseen edges as closed
      for (const [edgeId, prevState] of lastEdgeStates.entries()) {
        if (seenEdges.has(edgeId)) continue;

        const curState = ServiceState.Closed;
        if (curState === prevState) continue;

        lastEdgeStates.set(edgeId, curState);
        const [s1, s2] = edgeId.split("--");
        if (!s1 || !s2) continue;
        this.applySegmentEvent(line, s1, s2, prevState, curState);
      }

      // Station-level events
      for (const station of line.stations) {
        const prevState = this.lastStationStates.get(station.id) ?? ServiceState.Never;
        const curState = getStationStateAtDay(station, day);

        if (curState === prevState) continue;

        this.lastStationStates.set(station.id, curState);
        this.applyStationEvent(line, station, prevState, curState);
      }

      // Line-level events.
      // Put it at last to properly apply gust after all segment/station events.
      {
        const prevState = this.lastLineStates.get(line.id) ?? ServiceState.Never;
        const curState = getStateAtDay(line.statePoints, day);

        if (curState !== prevState) {
          this.lastLineStates.set(line.id, curState);
          this.applyLineEvent(line, prevState, curState);
        }
      }
    }
  }

  private applyLineEvent(line: LineData, fromState: ServiceState, toState: ServiceState) {
    if (toState === ServiceState.Open) {
      this.blossomSystem.triggerGust(fromState === ServiceState.Never ? 2 : 1.2);
    }

    // Emit particles at train head based on state transition
    const trainHeadPosRef = this.positionMap.get(headKey(line.id));
    if (!trainHeadPosRef?.val) return;

    const emission = geTrainEmission(fromState, toState);
    if (!emission) return;

    const emitter = new PointEmitter(this.blossomSystem, emission, trainHeadPosRef, line.colorHex);
    this.blossomSystem.addEmitter(emitter);
  }

  private applySegmentEvent(
    line: LineData,
    sid1: StationId,
    sid2: StationId,
    fromState: ServiceState,
    toState: ServiceState,
  ) {
    const emission = getLineEmission(fromState, toState);
    if (!emission) return;

    const firstPos = this.positionMap.get(sid1);
    const lastPos = this.positionMap.get(sid2);
    if (!firstPos || !lastPos) return;

    const emitter = new LineEmitter(this.blossomSystem, emission, firstPos, lastPos, line.colorHex);
    this.blossomSystem.addEmitter(emitter);
  }

  private applyStationEvent(
    line: LineData,
    station: StationData,
    fromState: ServiceState,
    toState: ServiceState,
  ) {
    const emission = getStationEmission(fromState, toState);
    if (!emission) return;

    const posRef = this.positionMap.get(station.id);
    if (!posRef) return;

    const emitter = new PointEmitter(this.blossomSystem, emission, posRef, line.colorHex);
    this.blossomSystem.addEmitter(emitter);
  }
}

// Helper to determine event type for state transitions
// When playing backward, we emit the inverse event
const getLineEmission = (from: ServiceState, to: ServiceState): LineEmitterConfig | undefined => {
  if (from === ServiceState.Never || from === ServiceState.Closed) return EMISSIONS.lineOpen;
  if (to === ServiceState.Never || to === ServiceState.Closed) return EMISSIONS.lineClose;
  if (from === ServiceState.Open && to === ServiceState.Suspended) return EMISSIONS.lineSuspend;
  if (from === ServiceState.Suspended && to === ServiceState.Open) return EMISSIONS.lineResume;
};

const getStationEmission = (
  from: ServiceState,
  to: ServiceState,
): PointEmitterConfig | undefined => {
  if (from === ServiceState.Never || from === ServiceState.Closed) return EMISSIONS.stationOpen;
  if (to === ServiceState.Never || to === ServiceState.Closed) return EMISSIONS.stationClose;
  if (from === ServiceState.Open && to === ServiceState.Suspended) return EMISSIONS.stationSuspend;
  if (from === ServiceState.Suspended && to === ServiceState.Open) return EMISSIONS.stationResume;
};

const geTrainEmission = (from: ServiceState, to: ServiceState): PointEmitterConfig | undefined => {
  if (from === ServiceState.Never || from === ServiceState.Closed) return EMISSIONS.trainOpen;
  if (to === ServiceState.Never || to === ServiceState.Closed) return EMISSIONS.trainClose;
  if (from === ServiceState.Open && to === ServiceState.Suspended) return EMISSIONS.trainSuspend;
  if (from === ServiceState.Suspended && to === ServiceState.Open) return EMISSIONS.trainResume;
};
