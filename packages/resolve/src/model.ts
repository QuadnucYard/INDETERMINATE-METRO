import assert from "node:assert";
import { type LineId, ServiceState, type StationId } from "im-shared/types";
import type { Route } from "./model/route";
import { computeLevels, extractRouteStations, resolveRoutes } from "./model/route";
import type { EventRecord, LineMeta, StationsSpec } from "./types";

export interface LineState {
  stationIds: StationId[];
  /** Should be either `Never` or `Open` */
  state: ServiceState;
  /** Routes of the line, forming a tree */
  routes: Route[];
  stations: Map<StationId, StationState>; // stationId -> state
}

export interface StationState {
  state: ServiceState;
  node: StationNode;
}

interface StationNode {
  /** The parent node in the directed tree representation */
  parent?: StationNode;
  children: StationNode[];
  /** Whether the edge pointing to parent is active */
  edgeState?: ServiceState;
  /** The relative height of the node in the vertical layout (not in the tree) */
  level: number;
}

export interface LineSnapshot {
  lineState: ServiceState;
  stations: Map<LineId, StationSnapshot>;
  routes: StationId[][];
}

export interface StationSnapshot {
  state: ServiceState;
  level: number;
}

// Currently, the branch support is limited.
// We do not support tree structure changes, only linear routes with possible junctions.
export class MetroModel {
  lines: Map<LineId, LineState>;

  constructor(metas: LineMeta[]) {
    this.lines = new Map();

    for (const m of metas) {
      // Extract station IDs from [name, translation] pairs
      const stationIds = m.stations.map((s) => s[0]);

      // Initialize line state
      const routes = resolveRoutes(stationIds, m.routes);
      const stationMap = new Map(
        stationIds.map((sid): [StationId, StationState] => [
          sid,
          { state: ServiceState.Never, node: { children: [], level: 0 } },
        ]),
      );

      // Build the tree
      // Here we assume that there is no branching in the bottom-up routes.
      for (const route of routes) {
        const getStationNode = (sid?: StationId): StationNode => {
          assert(sid, "Station ID is undefined when building tree");
          const stationState = stationMap.get(sid);
          assert(stationState, `Unknown station ID '${sid}' when building tree`);
          return stationState.node;
        };

        for (let i = 1; i < route.stations.length; i++) {
          const node = getStationNode(route.stations[i]);
          const parentNode = getStationNode(route.stations[i - 1]);
          node.parent = parentNode;
          parentNode.children.push(node);
          // Initially, all edges are inactive
        }
      }

      computeLevels(routes, stationMap);

      this.lines.set(m.id, {
        stationIds,
        state: ServiceState.Never,
        routes,
        stations: stationMap,
      });

      console.log(
        `Full route for Line ${m.id}:`,
        routes.map((route) => route.stations),
      );
    }
  }

  private getLineState(lineId: LineId): LineState {
    const line = this.lines.get(lineId);
    assert(line, `Unknown line ID '${lineId}'`);
    return line;
  }

  public applyEvent(event: EventRecord) {
    const line = this.getLineState(event.line);
    const { segment, subset: targetStations } = this.resolveOperatedStations(
      event.line,
      event.stations,
    );
    console.log(
      `[${event.date}] Applying event '${event.type}' on line '${event.line}' for stations:`,
      targetStations,
    );
    const newState = parseEvent(event.type);

    const getStation = (sid: StationId) => {
      const st = line.stations.get(sid);
      assert(st, `Unknown station ID '${sid}' on line '${event.line}' when getting state`);
      return st;
    };

    const updateStates = (
      targetStations: StationId[],
      segment: StationId[],
      newState: ServiceState,
    ) => {
      // Update target stations
      for (const sid of targetStations) {
        const st = getStation(sid);
        st.state = newState;
      }

      // Update edge active states
      for (const sid of segment.slice(1)) {
        const st = getStation(sid);
        const node = st.node;
        node.edgeState = newState;
      }
    };

    // Handle fullStations for deferred openings
    if (newState === ServiceState.Open && event.fullStations) {
      const { segment: fullSegment, subset: fullStationsList } = this.resolveOperatedStations(
        event.line,
        event.fullStations,
      );
      // Stations in fullStations but not in stations are deferred (show as suspended)
      updateStates(fullStationsList, fullSegment, ServiceState.Suspended);
    }

    // Update the target stations. The previous step ensures deferred stations are marked as Suspended.
    updateStates(targetStations, segment, newState);

    const hasOpen = line.stations.values().some((st) => st.state === ServiceState.Open);
    if (hasOpen) {
      // If any station is Open, line is Open.
      line.state = ServiceState.Open;
    }
  }

  private resolveOperatedStations(
    lineId: LineId,
    spec: StationsSpec,
  ): {
    segment: StationId[];
    subset: StationId[];
  } {
    if (Array.isArray(spec)) {
      // It's a list of names
      return { segment: spec, subset: spec };
    }

    const lineState = this.getLineState(lineId);
    const stations = lineState.stations;

    // It's a range { from, to, except }
    const segment = extractRouteStations(lineState.routes, spec.from, spec.to);

    // Include the endpoint if it is a realtime terminus.
    // In the tree, it means it has exactly one active neighbor.
    const isEndpoint = (sid?: StationId) => {
      if (!sid) return false;
      const node = stations.get(sid)?.node;
      assert(node);
      return (
        !node.parent ||
        node.children.length === 0 ||
        node.edgeState !== ServiceState.Open ||
        node.children.every((ch) => ch.edgeState !== ServiceState.Open)
      );
    };

    // Trim endpoints
    const subset = [...segment];
    if (!isEndpoint(subset[0])) subset.shift();
    if (!isEndpoint(subset.at(-1))) subset.shift();

    if (spec.except) {
      const exceptSet = new Set(spec.except);
      return { segment, subset: subset.filter((s) => !exceptSet.has(s)) };
    }
    if (subset.length === 0) {
      console.warn(
        `[WARNING] No stations resolved for line '${lineId}' from '${spec.from}' to '${
          spec.to
        }'. The current station states are: ${Array.from(lineState.stations.entries())
          .map(([sid, st]) => `${sid}: ${ServiceState[st.state]}`)
          .join(", ")}`,
      );
    }
    return { segment, subset };
  }

  public snapshot(lineId: LineId): LineSnapshot {
    const line = this.getLineState(lineId);

    const sMap = new Map<StationId, StationSnapshot>(
      line.stations.entries().map(([sid, st]) => [
        sid,
        {
          state: st.state,
          level: st.node.level,
        },
      ]),
    );

    const routes = this.snapshotRoutes(line);

    return { lineState: line.state, stations: sMap, routes };
  }

  private snapshotRoutes(line: LineState): StationId[][] {
    const isEdgeActive = (edgeState?: ServiceState) =>
      edgeState === ServiceState.Open || edgeState === ServiceState.Suspended;

    const routes: StationId[][] = [];
    for (const route of line.routes) {
      // Find the continuous active edges in the route
      let endIdx = route.stations.length - 1;
      while (endIdx > 0) {
        const sid = route.stations[endIdx];
        assert(sid);
        const st = line.stations.get(sid);
        assert(st);
        if (!isEdgeActive(st.node.edgeState)) {
          endIdx--;
          continue;
        }
        const segment = [sid];

        // Now endIdx points to an active station
        let startIdx = endIdx - 1;
        while (startIdx > 0) {
          const prevSid = route.stations[startIdx];
          assert(prevSid);
          const prevSt = line.stations.get(prevSid);
          assert(prevSt);
          segment.push(prevSid);
          if (!isEdgeActive(prevSt.node.edgeState)) {
            break;
          }
          startIdx--;
        }
        const prevSid = route.stations[startIdx];
        assert(prevSid);
        segment.push(prevSid);
        routes.push(segment.reverse());
        endIdx = startIdx - 1;
      }
    }
    return routes;
  }

  /**
   * Check if a route has any active (Open or Suspended) stations.
   */
  public isRouteActive(lineId: LineId, routeStations: StationId[]): boolean {
    const line = this.getLineState(lineId);
    // TODO: this only view the first station as junction - improve later
    return routeStations.slice(1).some((sid) => {
      const st = line.stations.get(sid);
      return st && (st.state === ServiceState.Open || st.state === ServiceState.Suspended);
    });
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
    default:
      throw new Error(`Unknown event type '${eventType}'`);
  }
}
