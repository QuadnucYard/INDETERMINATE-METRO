import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import {
  type LineData,
  type LineId,
  type PreviewData,
  type PreviewMeta,
  ServiceState,
  type StationId,
  type Vec2,
} from "im-shared/types";
import { calculateStationPositions } from "./layout";
import { MetroModel } from "./model";
import { loadJson, loadRidershipData } from "./parse";
import type { EventRecord, LineMeta } from "./types";

const DATA_DIR = path.join(process.cwd(), "../../data");
const INPUT_META_PATH = path.join(DATA_DIR, "lines_meta.json");
const INPUT_EVENTS_PATH = path.join(DATA_DIR, "events.json");
const INPUT_CSV_PATH = path.join(DATA_DIR, "ridership.csv");
const OUT_PATH = path.join(DATA_DIR, "../packages/preview/public/preview_ir.json");

const CONFIG = {
  width: 1920,
  height: 1080,
  topPadding: 50,
  bottomPadding: 50,
};

function simulate(
  ridershipMap: Map<LineId, Record<StationId, number>>,
  sortedDays: string[],
  eventsRaw: EventRecord[],
  linesMeta: LineMeta[],
) {
  // Initialize Model
  const model = new MetroModel(linesMeta);

  // Initialize IR structures
  const linesIR: Record<LineId, LineData> = {};

  // Pre-fill linesIR with static data
  linesMeta.forEach((lm, index) => {
    const baseX = lm.x ?? 160 + index * 80;

    // Main line
    linesIR[lm.id] = {
      id: lm.id,
      colorHex: lm.color,
      x: baseX,
      ridership: [],
      statePoints: [],
      stations: lm.stations.map((s) => ({
        id: s[0], // Use Chinese name as ID
        name: s[0],
        translation: s[1],
        existsFromDay: Number.MAX_SAFE_INTEGER, // default to never
        positions: [],
        service: [],
      })),
    };
  });

  // Helper to find station IR object
  const getStationIR = (lineId: LineId, stationId: StationId) => {
    const station = linesIR[lineId]?.stations.find((s) => s.id === stationId);
    if (!station) {
      throw new Error(`Station IR not found for ${stationId} on line ${lineId}`);
    }
    return station;
  };

  // Track previous positions to detect changes
  // lineId -> stationName -> lastXPos
  const lastPositions = new Map<LineId, Map<StationId, Vec2>>(
    linesMeta.map((lm) => [lm.id, new Map()]),
  );

  // Track previous states to detect changes
  const lastLineStates = new Map<LineId, ServiceState>();
  const lastStationStates = new Map<LineId, Map<StationId, ServiceState>>(
    linesMeta.map((lm) => [lm.id, new Map()]),
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

    // Process each line
    for (const lm of linesMeta) {
      const lineId = lm.id;
      const lineIR = linesIR[lineId];
      assert(lineIR, `Line IR missing for line ID ${lineId}`);

      const snapshot = model.snapshot(lineId);

      // Line Service State (Sparse)
      const lastState = lastLineStates.get(lineId);
      if (lastState !== snapshot.lineState) {
        lineIR.statePoints.push({ day: i, state: snapshot.lineState });
        lastLineStates.set(lineId, snapshot.lineState);
      }

      // Ridership (raw count in 万人)
      const count = dailyCounts[lineId] ?? 0;

      // Store raw ridership value
      lineIR.ridership.push(count);

      // Layout Stations
      const stationPositions = calculateStationPositions(
        model.stationOrder.get(lineId) ?? [],
        snapshot.stationStates,
        lineIR.x,
        CONFIG.topPadding,
        CONFIG.height - CONFIG.bottomPadding,
      );

      // Update Station IR
      for (const [stationId, state] of snapshot.stationStates) {
        const stIR = getStationIR(lineId, stationId);
        assert(stIR, `Station IR missing for ${stationId} on line ${lineId}`);

        // Service State (Sparse)
        const lineStStates = lastStationStates.get(lineId);
        assert(lineStStates);
        const lastStState = lineStStates.get(stationId);

        if (lastStState !== state) {
          if (!stIR.service) stIR.service = [];
          stIR.service.push({ day: i, state });
          lineStStates.set(stationId, state);
        }

        // Exists From Day
        if (
          (state === ServiceState.Open || state === ServiceState.Suspended) &&
          stIR.existsFromDay > i
        ) {
          stIR.existsFromDay = i;
        }

        // Position (Sparse)
        const pos = stationPositions.get(stationId);
        if (pos !== undefined) {
          // Check if changed
          const lineLastPos = lastPositions.get(lineId);
          assert(lineLastPos);
          const lastPos = lineLastPos.get(stationId);

          if (!lastPos || lastPos.x !== pos.x || lastPos.y !== pos.y) {
            stIR.positions.push({ day: i, ...pos });
            lineLastPos.set(stationId, pos);
          }
        }
      }
    }
  }

  for (const e of queuedEvents) {
    console.warn(`Unapplied event on ${e.date} for line ${e.line}`);
  }

  return linesIR;
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

  // Run simulation to generate PreviewData
  const linesData = simulate(ridershipMap, sortedDays, eventsRaw, linesMeta);

  // Finalize Data
  const meta: PreviewMeta = {
    width: CONFIG.width,
    height: CONFIG.height,
    days: sortedDays,
  };

  const previewData: PreviewData = {
    meta,
    lines: linesData,
  };

  // Write output
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(previewData), "utf8");
  console.log(`Wrote PreviewIR to ${OUT_PATH}`);
}

main().catch(console.error);
