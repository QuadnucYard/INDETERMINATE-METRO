import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import {
  type LineData,
  type LineId,
  type PreviewData,
  type PreviewMeta,
  type RouteData,
  ServiceState,
  type StationId,
  type Vec2,
} from "im-shared/types";
import { calculateStationPositions } from "./layout";
import { formatStationId, MetroModel } from "./model";
import { loadJson, loadRidershipData } from "./parse";
import type { EventRecord, LineMeta } from "./types";

const DATA_DIR = path.join(process.cwd(), "../../data");
const INPUT_META_PATH = path.join(DATA_DIR, "lines-meta.json");
const INPUT_EVENTS_PATH = path.join(DATA_DIR, "events.json");
const INPUT_CSV_PATH = path.join(DATA_DIR, "ridership.csv");
const OUT_PATH = path.join(DATA_DIR, "../packages/preview/public/preview_ir.json");

const CONFIG = {
  width: 1920,
  height: 1080,
  topPadding: 50,
  bottomPadding: 50,
  branchOffset: 30, // x offset between main and branch stems
};

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

function simulate(
  ridershipMap: Map<LineId, Record<StationId, number>>,
  sortedDays: string[],
  eventsRaw: EventRecord[],
  linesMeta: LineMeta[],
) {
  // Initialize Model
  const model = new MetroModel(linesMeta);

  // Initialize IR structures
  const linesIR: Record<LineId, LineData> = Object.fromEntries(
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

  // Helper to find station IR object
  const getStationIR = (lineId: LineId, stationId: StationId) => {
    const station = linesIR[lineId]?.stations.find((s) => s.id === stationId);
    assert(station, `Station IR not found for ${stationId} on line ${lineId}`);
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
      const lineIR = linesIR[lineId];
      assert(lineIR, `Line IR missing for line ID ${lineId}`);

      const line = tracked.get(lineId);
      assert(line);

      const snapshot = model.snapshot(lineId);

      // Line Service State (Sparse)
      if (line.service !== snapshot.lineState) {
        lineIR.statePoints.push({ day: i, state: snapshot.lineState });
        line.service = snapshot.lineState;
      }

      // Store raw ridership value
      if (line.service === ServiceState.Open) {
        if (!(lineId in dailyCounts) && !lm.dummyRidership) {
          console.error(`No ridership data for line ${lineId} on date ${date}`);
        }
        if (lineIR.firstDay === undefined) {
          lineIR.firstDay = i;
        }
      }
      if (lineIR.firstDay !== undefined) {
        // Only record ridership after firstDay
        lineIR.ridership.push(dailyCounts[lineId] ?? lm.dummyRidership ?? 0);
      }

      if (snapshot.routes.length > 0 || line.routesCode !== undefined) {
        const routesCode = JSON.stringify(snapshot.routes);
        if (line.routesCode !== routesCode) {
          lineIR.routePoints.push({ day: i, value: snapshot.routes });
          line.routes = snapshot.routes;
          line.routesCode = routesCode;
          console.log(`Day ${i} (${date}): Line ${lineId} routes changed:`, snapshot.routes);
        }
      }

      // Layout Stations
      const stationPositions = calculateStationPositions(
        line.routes,
        snapshot.stations,
        lineIR.x,
        CONFIG.topPadding,
        CONFIG.height - CONFIG.bottomPadding,
      );

      // Update Station IR
      for (const [stationId, stationSnapshot] of snapshot.stations) {
        const stIR = getStationIR(lineId, stationId);
        assert(stIR, `Station IR missing for ${stationId} on line ${lineId}`);

        // Service State (Sparse)
        const station = line.stations.get(stationId);
        assert(station, `Tracked station state missing for ${stationId} on line ${lineId}`);

        const state = stationSnapshot.state;
        if (station.service !== state) {
          stIR.service.push({ day: i, state: state });
          station.service = state;
        }

        // Position (Sparse)
        const pos = stationPositions.get(stationId);
        if (pos) {
          // Check if changed
          const lastPos = station.position;
          if (!lastPos || lastPos.x !== pos.x || lastPos.y !== pos.y) {
            stIR.positions.push({ day: i, ...pos });
            station.position = pos;
          }
        }
      }
    }
  }

  for (const e of queuedEvents) {
    console.warn(`Unapplied event on ${e.date} for line ${e.line}`);
  }

  return { linesData: linesIR, totalRiderships };
}

/**
 * Generate an array of ISO date strings from startDate to endDate (exclusive)
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current < end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function extendDummyDays(sortedDays: string[], eventsRaw: EventRecord[]) {
  // Find the first event date
  const sortedEvents = eventsRaw.toSorted((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const firstEventDate = sortedEvents[0]?.date;

  // Build full days array, prepending dummy days if needed
  const allDays = [...sortedDays];

  const firstRidershipDate = sortedDays[0];
  if (firstEventDate && firstRidershipDate && firstEventDate < firstRidershipDate) {
    // Generate dummy days from first event to first ridership date
    const dummyDays = generateDateRange(firstEventDate, firstRidershipDate);
    console.log(
      `Adding ${dummyDays.length} dummy days from ${firstEventDate} to ${firstRidershipDate}`,
    );

    allDays.splice(0, 0, ...dummyDays);
  }

  return allDays;
}

async function main() {
  const linesMeta = await loadJson<LineMeta[]>(INPUT_META_PATH);
  const eventsRaw = await loadJson<EventRecord[]>(INPUT_EVENTS_PATH);

  if (!linesMeta || !eventsRaw) {
    console.error("Failed to load input files.");
    process.exit(1);
  }

  // Load computed CSV ridership (expected to be present in /output/ridership.csv)
  const { ridershipMap, sortedDays } = await loadRidershipData(INPUT_CSV_PATH);

  const allDays = extendDummyDays(sortedDays, eventsRaw);

  // Run simulation to generate PreviewData
  const { linesData, totalRiderships } = simulate(ridershipMap, allDays, eventsRaw, linesMeta);

  // Finalize Data
  const meta: PreviewMeta = {
    width: CONFIG.width,
    height: CONFIG.height,
  };

  const previewData: PreviewData = {
    meta,
    days: allDays,
    totalRiderships,
    lines: linesData,
  };

  // Write output
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(previewData), "utf8");
  console.log(`Wrote PreviewIR to ${OUT_PATH}`);
}

main().catch(console.error);
