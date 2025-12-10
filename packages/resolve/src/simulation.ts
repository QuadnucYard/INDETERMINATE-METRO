import assert from "node:assert";
import {
  type LineData,
  type LineId,
  type RouteData,
  ServiceState,
  type StationId,
  type Vec2,
} from "im-shared/types";
import { calculateStationPositions } from "./layout";
import { formatStationId, MetroModel } from "./model";
import type { EventRecord, LineMeta } from "./types";

export interface LayoutConfig {
  width: number;
  height: number;
  topPadding: number;
  bottomPadding: number;
  branchOffset: number;
}

interface TrackedLineState {
  service?: ServiceState;
  routes: RouteData[];
  routesCode?: string;
  stations: Map<StationId, TrackedStationState>;
}

interface TrackedStationState {
  service?: ServiceState;
  position?: Vec2;
}

export function simulate(
  ridershipMap: Map<LineId, Record<StationId, number>>,
  sortedDays: string[],
  eventsRaw: EventRecord[],
  linesMeta: LineMeta[],
  layoutConfig: LayoutConfig,
) {
  // Initialize Model
  const model = new MetroModel(linesMeta);

  // Initialize data structures
  const linesData: Record<LineId, LineData> = Object.fromEntries(
    linesMeta.map((lm, index) => {
      const v: LineData = {
        id: lm.id,
        colorHex: lm.color,
        x: lm.x ?? 160 + index * 80,
        ridership: [],
        statePoints: [],
        routePoints: [],
        stations: lm.stations.map((s) => ({
          id: formatStationId(lm.id, s[0]),
          name: s[0],
          translation: s[1],
          positions: [],
          service: [],
        })),
      };
      return [lm.id, v];
    }),
  );
  const totalRiderships: number[] = [];

  // Helper to find station data object
  const getStationData = (lineId: LineId, stationId: StationId) => {
    const station = linesData[lineId]?.stations.find((s) => s.id === stationId);
    assert(station, `Station data not found for ${stationId} on line ${lineId}`);
    return station;
  };

  // Track previous state to detect changes
  const tracked = new Map<LineId, TrackedLineState>(
    linesMeta.map((lm) => [
      lm.id,
      {
        routes: [],
        stations: new Map<StationId, TrackedStationState>(
          lm.stations.map((s) => [formatStationId(lm.id, s[0]), {}]),
        ),
      },
    ]),
  );

  const queuedEvents = eventsRaw.toSorted((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  // Simulation Loop
  for (let i = 0; i < sortedDays.length; i++) {
    const date = sortedDays[i];
    assert(date);

    // Apply events
    while (queuedEvents[0] && queuedEvents[0].date <= date) {
      const e = queuedEvents[0];
      queuedEvents.shift();
      if (e && e.date.length !== 10) {
        // Skip invalid date
        continue;
      }
      model.applyEvent(e);
    }

    // Get ridership
    const dailyCounts = ridershipMap.get(date) ?? {};
    totalRiderships.push(dailyCounts["total"] ?? 0);

    // Process each line
    for (const lm of linesMeta) {
      const lineId = lm.id;
      const lineData = linesData[lineId];
      assert(lineData, `Line data missing for line ID ${lineId}`);

      const line = tracked.get(lineId);
      assert(line);

      const snapshot = model.snapshot(lineId);

      // Line Service State (Sparse)
      if (line.service !== snapshot.lineState) {
        lineData.statePoints.push({ day: i, state: snapshot.lineState });
        line.service = snapshot.lineState;
      }

      // Store raw ridership value
      if (line.service === ServiceState.Open) {
        if (!(lineId in dailyCounts) && !lm.dummyRidership) {
          console.error(`No ridership data for line ${lineId} on date ${date}`);
        }
        if (lineData.firstDay === undefined) {
          lineData.firstDay = i;
        }
      }
      if (lineData.firstDay !== undefined) {
        // Only record ridership after firstDay
        lineData.ridership.push(dailyCounts[lineId] ?? lm.dummyRidership ?? 0);
      }

      if (snapshot.routes.length > 0 || line.routesCode !== undefined) {
        const routesCode = JSON.stringify(snapshot.routes);
        if (line.routesCode !== routesCode) {
          lineData.routePoints.push({ day: i, value: snapshot.routes });
          line.routes = snapshot.routes;
          line.routesCode = routesCode;
          console.log(`Day ${i} (${date}): Line ${lineId} routes changed:`, snapshot.routes);
        }
      }

      // Layout Stations
      const stationPositions = calculateStationPositions(
        line.routes,
        snapshot.stations,
        lineData.x,
        layoutConfig.topPadding,
        layoutConfig.height - layoutConfig.bottomPadding,
        layoutConfig.branchOffset,
      );

      // Update station data
      for (const [stationId, stationSnapshot] of snapshot.stations) {
        const stData = getStationData(lineId, stationId);
        assert(stData, `Station Data missing for ${stationId} on line ${lineId}`);

        // Service State (Sparse)
        const station = line.stations.get(stationId);
        assert(station, `Tracked station state missing for ${stationId} on line ${lineId}`);

        const state = stationSnapshot.state;
        if (station.service !== state) {
          stData.service.push({ day: i, state: state });
          station.service = state;
        }

        // Position (Sparse)
        const pos = stationPositions.get(stationId);
        if (pos) {
          // Check if changed
          const lastPos = station.position;
          if (!lastPos || lastPos.x !== pos.x || lastPos.y !== pos.y) {
            stData.positions.push({ day: i, ...pos });
            station.position = pos;
          }
        }
      }
    }
  }

  for (const e of queuedEvents) {
    console.warn(`Unapplied event on ${e.date} for line ${e.line}`);
  }

  return { linesData: linesData, totalRiderships };
}
