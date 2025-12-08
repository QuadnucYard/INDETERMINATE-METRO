import { type LineData, type PreviewData, ServiceState, type StationData } from "../types";
import { getStationPositionAtDay } from "../utils";
import type { EmitterConfig } from "./config";
import { EMITTER_CONFIGS as EMISSIONS } from "./presets";
import type { BlossomSystem } from "./system";

export class BlossomSchedule {
  private lastEventDay: number = -1;
  // Track station states for detecting changes
  private lastStationStates = new Map<string, ServiceState>();

  constructor(private blossomSystem: BlossomSystem) {}

  public update(data: PreviewData, day: number) {
    if (day === this.lastEventDay) return;

    const lastEventDay = this.lastEventDay;
    this.lastEventDay = day;

    // Determine day range to check based on direction
    const isForward = day > lastEventDay;

    const minDay = isForward ? lastEventDay : day;
    const maxDay = isForward ? day : lastEventDay;

    // Check for line state changes
    for (const line of Object.values(data.lines)) {
      // Line-level events
      for (const pt of line.statePoints) {
        if (pt.day <= minDay || pt.day > maxDay) continue;

        const prevState = line.statePoints.find((p) => p.day < pt.day)?.state ?? ServiceState.Never;

        // Determine from/to states based on play direction
        const fromState = isForward ? prevState : pt.state;
        const toState = isForward ? pt.state : prevState;

        this.applyLineEvent(line, pt.day, fromState, toState);
      }

      // Station-level events
      for (const station of line.stations) {
        const stationKey = `${line.id}:${station.id}`;
        for (const pt of station.service) {
          if (pt.day <= minDay || pt.day > maxDay) continue;

          const prevState = this.lastStationStates.get(stationKey) ?? ServiceState.Never;
          if (isForward) {
            this.lastStationStates.set(stationKey, pt.state);
          }

          // Determine from/to states based on play direction
          const fromState = isForward ? prevState : pt.state;
          const toState = isForward ? pt.state : prevState;

          this.applyStationEvent(line, station, pt.day, fromState, toState);
        }
      }
    }
  }

  private applyLineEvent(
    line: LineData,
    day: number,
    fromState: ServiceState,
    toState: ServiceState,
  ) {
    const emission = getLineEmission(fromState, toState);
    if (!emission) return;

    // Get all active station positions for this line at this day
    const activeStationPositions: { x: number; y: number }[] = [];
    for (const station of line.stations) {
      const pos = getStationPositionAtDay(station, day);
      if (pos) {
        activeStationPositions.push(pos);
      }
    }

    // Emit across all stations on the line
    const emitAcrossLine = (cfg: EmitterConfig, intensity: number = 1) => {
      // Distribute intensity across stations
      const perStationIntensity = intensity / Math.max(1, Math.sqrt(activeStationPositions.length));
      for (const pos of activeStationPositions) {
        this.blossomSystem.emitBurst(cfg, {
          x: pos.x,
          y: pos.y,
          color: line.colorHex,
          intensity: perStationIntensity,
        });
      }
    };

    // Emit based on event type
    const intensity = toState === ServiceState.Open ? 1.5 : 1;
    emitAcrossLine(emission, intensity);
    if (toState === ServiceState.Open) {
      this.blossomSystem.triggerGust(fromState === ServiceState.Never ? 2 : 1.2);
    }
  }

  private applyStationEvent(
    line: LineData,
    station: StationData,
    day: number,
    fromState: ServiceState,
    toState: ServiceState,
  ) {
    const emission = getStationEmission(fromState, toState);
    if (!emission) {
      return;
    }

    // Get station position
    const pos = getStationPositionAtDay(station, day);
    if (!pos) {
      return;
    }

    this.blossomSystem.emitBurst(emission, {
      x: pos.x,
      y: pos.y,
      color: line.colorHex,
    });
  }
}

// Helper to determine event type for state transitions
// When playing backward, we emit the inverse event
const getLineEmission = (from: ServiceState, to: ServiceState): EmitterConfig | undefined => {
  if (from === ServiceState.Never || from === ServiceState.Closed) return EMISSIONS.open;
  if (to === ServiceState.Never || to === ServiceState.Closed) return EMISSIONS.close;
  if (from === ServiceState.Open && to === ServiceState.Suspended) return EMISSIONS.suspend;
  if (from === ServiceState.Suspended && to === ServiceState.Open) return EMISSIONS.resume;
};

const getStationEmission = (from: ServiceState, to: ServiceState): EmitterConfig | undefined => {
  if (from === ServiceState.Never || from === ServiceState.Closed) return EMISSIONS.stationOpen;
  if (to === ServiceState.Never || to === ServiceState.Closed) return EMISSIONS.stationClose;
  if (from === ServiceState.Open && to === ServiceState.Suspended) return EMISSIONS.stationSuspend;
  if (from === ServiceState.Suspended && to === ServiceState.Open) return EMISSIONS.stationResume;
};
