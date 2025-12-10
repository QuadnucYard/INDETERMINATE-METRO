import assert from "node:assert";
import {
  type LineId,
  type RouteData,
  ServiceState,
  type StationId,
  type StationName,
} from "im-shared/types";
import * as _ from "radash";
import type { Route } from "./model/route";
import { computeLevels, extractRouteStations, resolveRoutes } from "./model/route";
import type { EventRecord, LineMeta, StationsSpec } from "./types";

export interface LineState {
  /** Should be either `Never` or `Open` */
  state: ServiceState;
  /** Routes of the line, forming a tree */
  routes: Route[];
  stations: Map<StationId, StationState>; // stationId -> state
  stationIdMap: Map<StationName, StationId>; // stationName -> stationId
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
  routes: RouteData[];
}

export interface StationSnapshot {
  state: ServiceState;
  level: number;
}

export function formatStationId(lineId: LineId, stationName: StationId): string {
  return `${lineId}:${stationName}`;
}

// Currently, the branch support is limited.
// We do not support tree structure changes, only linear routes with possible junctions.
export class MetroModel {
  lines: Map<LineId, LineState>;

  constructor(metas: LineMeta[]) {
    this.lines = new Map();

    for (const lm of metas) {
      // Extract station IDs from [name, translation] pairs
      const stationNames = lm.stations.map((s) => s[0]);
      const stationIds = stationNames.map((name) => formatStationId(lm.id, name));
      const stationIdMap = new Map(_.zip(stationNames, stationIds));

      // Initialize line state
      const routes = resolveRoutes(stationNames, stationIdMap, lm.routes);
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

      this.lines.set(lm.id, {
        state: ServiceState.Never,
        routes,
        stations: stationMap,
        stationIdMap,
      });

      console.log(
        `Full route for Line ${lm.id}:`,
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

    if (line.stations.values().some((st) => st.state === ServiceState.Open)) {
      // If any station is Open, line is Open.
      line.state = ServiceState.Open;
    } else if (line.stations.values().some((st) => st.state === ServiceState.Suspended)) {
      // If any station is Suspended, line is Suspended.
      line.state = ServiceState.Suspended;
    }
  }

  private resolveOperatedStations(
    lineId: LineId,
    spec: StationsSpec,
  ): {
    segment: StationId[];
    subset: StationId[];
  } {
    const lineState = this.getLineState(lineId);
    const getStationId = (name: StationName): StationId => {
      const sid = lineState.stationIdMap.get(name);
      assert(sid, `Station name '${name}' not found on line '${lineId}'`);
      return sid;
    };

    if (Array.isArray(spec)) {
      // It's a list of names
      const stationIds = spec.map(getStationId);
      return { segment: stationIds, subset: stationIds };
    }
    const stations = lineState.stations;

    // It's a range { from, to, except }
    const segment = extractRouteStations(
      lineState.routes,
      getStationId(spec.from),
      getStationId(spec.to),
    );

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
      const exceptSet = new Set(spec.except.map(getStationId));
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

  private snapshotRoutes(line: LineState): RouteData[] {
    const isEdgeActive = (edgeState?: ServiceState) =>
      edgeState === ServiceState.Open || edgeState === ServiceState.Suspended;

    const routes: RouteData[] = [];
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
        const routeState = st.node.edgeState;

        // Now endIdx points to an active station
        let startIdx = endIdx - 1;
        while (startIdx > 0) {
          const prevSid = route.stations[startIdx];
          assert(prevSid);
          const prevSt = line.stations.get(prevSid);
          assert(prevSt);
          segment.push(prevSid);
          if (prevSt.node.edgeState !== routeState) {
            break;
          }
          startIdx--;
        }
        const prevSid = route.stations[startIdx];
        assert(prevSid);
        segment.push(prevSid);
        routes.push({ stations: segment.reverse(), state: routeState });
        const prevSt = line.stations.get(prevSid);
        endIdx = isEdgeActive(prevSt?.node.edgeState) ? startIdx : startIdx - 1;
      }
    }

    // simplify routes by merging consecutive ones with the same state
    // to ensure routes break at junctions, we should check occurrence of stations
    const simplified: RouteData[] = [];
    const occurrence = _.counting(
      routes.flatMap((r) => r.stations),
      (sid) => sid,
    );
    for (const r of routes) {
      const last = simplified.at(-1);
      if (
        last?.state === r.state &&
        last.stations.at(-1) === r.stations[0] &&
        r.stations[0] &&
        occurrence[r.stations[0]] === 2 // should not be a junction
      ) {
        // Merge
        last.stations.pop(); // remove duplicate junction
        last.stations.push(...r.stations);
      } else {
        simplified.push(r);
      }
    }

    return simplified;
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
