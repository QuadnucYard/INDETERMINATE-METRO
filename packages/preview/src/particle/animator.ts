import { Rgb } from "../color";
import { getStationPositionAtDay } from "../keyframe";
import { type LineData, type PreviewData, ServiceState } from "../types";
import { EMITTER_PRESETS } from "./presets";
import type { ParticleSystem } from "./system";
import type { EmitterConfig, StrokeSegment, Vec2 } from "./types";

interface EventTrigger {
  day: number;
  configs: EmitterConfig[];
  position?: Vec2;
  stroke?: StrokeSegment;
  color: string;
}

/**
 * Manages particle emission based on animation events
 */
export class ParticleAnimator {
  private lastDay = -1;

  constructor(private particleSystem: ParticleSystem) {}

  /**
   * Update and emit particles based on current day
   */
  public update(data: PreviewData, currentDay: number) {
    const day = Math.floor(currentDay);

    // Only process when crossing day boundaries forward
    if (day <= this.lastDay) {
      this.lastDay = day;
      return;
    }

    // Extract triggers once at start
    if (this.lastDay < 0) {
      this.extractEventTriggers(data);
    }

    // Find and trigger events in the crossed range
    const triggers = this.extractEventTriggers(data);

    for (const trigger of triggers) {
      if (trigger.day > this.lastDay && trigger.day <= day) {
        for (const config of trigger.configs) {
          // Use line color with appropriate alpha based on effect type
          const colorOverride = Rgb.fromHex(trigger.color)
            .withAlpha(config.alpha ?? 1.0)
            .toCss();
          this.particleSystem.emitBurst(config, trigger.position, trigger.stroke, {
            color: colorOverride,
          });
        }
      }
    }

    this.lastDay = day;
  }

  /**
   * Extract event triggers from IR data
   */
  private extractEventTriggers(data: PreviewData): EventTrigger[] {
    const triggers: EventTrigger[] = [];

    const trigger = (day: number, configs: EmitterConfig[], line: LineData, position?: Vec2) => {
      // Calculate stroke segment for line effects
      let minY = Infinity;
      let maxY = -Infinity;

      for (const s of line.stations) {
        if (s.positions[0]) {
          minY = Math.min(minY, s.positions[0].y);
          maxY = Math.max(maxY, s.positions[0].y);
        }
      }

      const stroke: StrokeSegment = {
        x0: line.x,
        y0: minY,
        x1: line.x,
        y1: maxY,
      };

      triggers.push({
        day,
        configs,
        position,
        stroke,
        color: line.colorHex,
      });
    };

    const PRESETS = EMITTER_PRESETS;

    for (const line of Object.values(data.lines)) {
      // Line state changes
      for (let i = 0; i < line.statePoints.length; i++) {
        const pt = line.statePoints[i];
        if (!pt) continue;

        const prevState = line.statePoints[i - 1]?.state ?? ServiceState.Never;

        if (
          prevState === ServiceState.Never &&
          (pt.state === ServiceState.Open || pt.state === ServiceState.Suspended)
        ) {
          // Line appearing
          trigger(pt.day, [PRESETS.lineAppearRibbon, PRESETS.lineAppearSpores], line);
        } else if (prevState === ServiceState.Open && pt.state === ServiceState.Suspended) {
          // Line suspending
          trigger(pt.day, [PRESETS.suspendDust], line);
        } else if (prevState === ServiceState.Suspended && pt.state === ServiceState.Open) {
          // Line resuming
          trigger(pt.day, [PRESETS.resumeSparks], line);
        } else if (
          (prevState === ServiceState.Open || prevState === ServiceState.Suspended) &&
          pt.state === ServiceState.Closed
        ) {
          // Line closing
          trigger(pt.day, [PRESETS.closeCrumble], line);
        }
      }

      // Station appearance and state changes
      for (const station of line.stations) {
        // Station service state changes
        for (let i = 0; i < station.service.length; i++) {
          const pt = station.service[i];
          if (!pt) continue;

          const prevState = station.service[i - 1]?.state ?? ServiceState.Never;
          const pos = getStationPositionAtDay(station, pt.day);
          if (!pos) continue;

          if (prevState === ServiceState.Never && pt.state === ServiceState.Open) {
            trigger(pt.day, [PRESETS.stationSuspendFade], line, pos);
          } else if (prevState === ServiceState.Open && pt.state === ServiceState.Suspended) {
            trigger(pt.day, [PRESETS.stationSuspendFade], line, pos);
          } else if (prevState === ServiceState.Suspended && pt.state === ServiceState.Open) {
            trigger(pt.day, [PRESETS.stationResumeGlow], line, pos);
          }
        }
      }
    }

    return triggers.sort((a, b) => a.day - b.day);
  }
}
