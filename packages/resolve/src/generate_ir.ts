import fs from "node:fs/promises";
import path from "node:path";
import { type IRMeta, type LineIR, type PreviewIR, ServiceState } from "./ir";
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
  ridershipMap: Map<string, Record<string, number>>,
  sortedDays: string[],
  eventsRaw: EventRecord[],
  linesMeta: LineMeta[],
) {
  // Initialize Model
  const model = new MetroModel(linesMeta);

  // Initialize IR structures
  const linesIR: Record<string, LineIR> = {};

  // Pre-fill linesIR with static data
  linesMeta.forEach((lm, index) => {
    linesIR[lm.id] = {
      id: lm.id,
      colorHex: lm.color,
      x: lm.x ?? 160 + index * 80,
      ridership: [],
      statePoints: [],
      stations: lm.stations.map((s) => ({
        id: s[0], // Use Chinese name as ID
        name: s[0],
        translation: s[1],
        existsFromDay: 999999, // default to never
        positions: [],
        service: [],
      })),
    };
  });

  // Helper to find station IR object
  const getStationIR = (lineId: string, stationName: string) => {
    const station = linesIR[lineId]?.stations.find((s) => s.name === stationName);
    if (!station) {
      throw new Error(`Station IR not found for ${stationName} on line ${lineId}`);
    }
    return station;
  };

  // Track previous positions to detect changes
  // lineId -> stationName -> lastY
  const lastPositions = new Map<string, Map<string, number>>();

  // Track previous states to detect changes
  const lastLineStates = new Map<string, ServiceState>();
  const lastStationStates = new Map<string, Map<string, ServiceState>>();

  const queuedEvents = eventsRaw.toSorted((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  // Simulation Loop
  for (let i = 0; i < sortedDays.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: always valid
    const date = sortedDays[i]!;

    // Apply events
    while (queuedEvents[0] && queuedEvents[0].date <= date) {
      const e = queuedEvents[0];
      queuedEvents.shift();
      if (e && e.date.length !== 10) {
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
      if (!lineIR) continue;

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
        model.stationOrder.get(lineId) || [],
        snapshot.stationStates,
        CONFIG.topPadding,
        CONFIG.height - CONFIG.bottomPadding,
      );

      // Update Station IR
      for (const [stationName, state] of snapshot.stationStates) {
        const stIR = getStationIR(lineId, stationName);
        if (!stIR) continue;

        // Service State (Sparse)
        if (!lastStationStates.has(lineId)) lastStationStates.set(lineId, new Map());
        const lineStStates = lastStationStates.get(lineId);
        if (!lineStStates) continue;
        const lastStState = lineStStates.get(stationName);

        if (lastStState !== state) {
          if (!stIR.service) stIR.service = [];
          stIR.service.push({ day: i, state });
          lineStStates.set(stationName, state);
        }

        // Exists From Day
        if (
          (state === ServiceState.Open || state === ServiceState.Suspended) &&
          stIR.existsFromDay > i
        ) {
          stIR.existsFromDay = i;
        }

        // Position (Sparse)
        const y = stationPositions.get(stationName);
        if (y !== undefined) {
          // Check if changed
          if (!lastPositions.has(lineId)) lastPositions.set(lineId, new Map());
          const lineLastPos = lastPositions.get(lineId);
          if (!lineLastPos) continue;
          const lastY = lineLastPos.get(stationName);

          if (lastY !== y) {
            stIR.positions.push({ day: i, y });
            lineLastPos.set(stationName, y);
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

  // Run simulation to generate PreviewIR
  const linesIR = simulate(ridershipMap, sortedDays, eventsRaw, linesMeta);

  // Finalize IR
  const meta: IRMeta = {
    width: CONFIG.width,
    height: CONFIG.height,
    days: sortedDays,
  };

  const previewIR: PreviewIR = {
    meta,
    lines: linesIR,
  };

  // Write output
  await fs.writeFile(OUT_PATH, JSON.stringify(previewIR), "utf8");
  console.log(`Wrote PreviewIR to ${OUT_PATH}`);
}

main().catch(console.error);
