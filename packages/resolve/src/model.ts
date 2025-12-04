import { ServiceState } from "./ir";
import type { EventRecord, LineMeta, StationsSpec } from "./types";

export interface StationState {
  state: ServiceState;
}

export interface LineState {
  /** Should be either `Never` or `Open` */
  state: ServiceState;
  stations: Map<string, StationState>; // stationId -> state
}

export interface Snapshot {
  lineState: ServiceState;
  stationStates: Map<string, ServiceState>;
}

export class MetroModel {
  lines: Map<string, LineState>;
  lineMeta: Map<string, LineMeta>;
  stationOrder: Map<string, string[]>; // lineId -> ordered station IDs

  constructor(metas: LineMeta[]) {
    this.lines = new Map();
    this.lineMeta = new Map();
    this.stationOrder = new Map();

    for (const m of metas) {
      this.lineMeta.set(m.id, m);
      // Extract station IDs from [name, translation] pairs
      const stationIds = m.stations.map((s) => s[0]);
      this.stationOrder.set(m.id, stationIds);

      // Initialize line state
      const stationMap = new Map<string, StationState>();
      for (const sid of stationIds) {
        stationMap.set(sid, { state: ServiceState.Never });
      }
      this.lines.set(m.id, {
        state: ServiceState.Never,
        stations: stationMap,
      });
    }
  }

  private getLineState(lineId: string): LineState {
    const line = this.lines.get(lineId);
    if (!line) {
      throw new Error(`Unknown line ID '${lineId}'`);
    }
    return line;
  }

  public applyEvent(event: EventRecord) {
    const line = this.getLineState(event.line);
    const targetStations = this.resolveStations(event.line, event.stations);
    console.log(
      `[${event.date}] Applying event '${event.type}' on line '${event.line}' for stations: ${targetStations.join(", ")}`,
    );
    const newState = parseEvent(event.type);

    const getStation = (sid: string) => {
      const st = line.stations.get(sid);
      if (!st) {
        throw new Error(`Unknown station ID '${sid}' on line '${event.line}' when getting state`);
      }
      return st;
    };

    // Handle fullStations for deferred openings
    if (event.type === "open" && event.fullStations) {
      const fullStationsList = this.resolveStations(event.line, event.fullStations);
      // Stations in fullStations but not in stations are deferred (show as suspended)
      for (const sid of fullStationsList) {
        if (!targetStations.includes(sid)) {
          const st = getStation(sid);
          if (st.state === ServiceState.Never) {
            st.state = ServiceState.Suspended; // Deferred opening - exists but suspended
          }
        }
      }
    }

    // Update target stations
    for (const sid of targetStations) {
      const st = getStation(sid);
      st.state = newState;
    }

    const hasOpen = line.stations.values().some((st) => st.state === ServiceState.Open);
    if (hasOpen) {
      // If any station is Open, line is Open.
      line.state = ServiceState.Open;
    }
  }

  private resolveStations(lineId: string, spec: StationsSpec): string[] {
    const allStations = this.stationOrder.get(lineId);
    if (!allStations) {
      throw new Error(`Unknown line ID '${lineId}' when resolving stations`);
    }

    if (Array.isArray(spec)) {
      // It's a list of names
      return spec;
    }

    // It's a range { from, to, except }
    const fromIdx = allStations.indexOf(spec.from);
    const toIdx = allStations.indexOf(spec.to);
    if (fromIdx === -1) {
      throw new Error(`Station '${spec.from}' not found on line '${lineId}'`);
    }
    if (toIdx === -1) {
      throw new Error(`Station '${spec.to}' not found on line '${lineId}'`);
    }

    // Compute inclusive start/end indices
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);

    // Determine whether to include endpoints based on eventType and station/line info
    const lineState = this.getLineState(lineId);

    // Determine realtime termini (based on visible/open/suspended stations) or fall back to static endpoints
    const getStationState = (idx: number) => {
      const sid = allStations[idx];
      return (sid && lineState.stations.get(sid)?.state) || ServiceState.Never;
    };

    // TODO: this is not precise enough
    const isRealtimeTerminus = (idx: number) =>
      getStationState(idx - 1) !== ServiceState.Open ||
      getStationState(idx + 1) !== ServiceState.Open;

    // Construct subset and then optionally trim endpoints
    const subset = allStations.slice(start, end + 1);
    if (!isRealtimeTerminus(start)) subset.shift();
    if (!isRealtimeTerminus(end)) subset.pop();
    if (spec.except) {
      const exceptSet = new Set(spec.except);
      return subset.filter((s) => !exceptSet.has(s));
    }
    return subset;
  }

  public snapshot(lineId: string): Snapshot {
    const line = this.getLineState(lineId);

    const sMap = new Map<string, ServiceState>();
    for (const [sid, st] of line.stations) {
      sMap.set(sid, st.state);
    }
    return { lineState: line.state, stationStates: sMap };
  }
}

function parseEvent(eventType: "open" | "close" | "suspend" | "resume"): ServiceState {
  switch (eventType) {
    case "open":
      return ServiceState.Open;
    case "close":
      return ServiceState.Closed;
    case "suspend":
      return ServiceState.Suspended;
    case "resume":
      return ServiceState.Open;
  }
}
