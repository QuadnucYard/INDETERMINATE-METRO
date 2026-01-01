import fs from "node:fs/promises";
import path from "node:path";
import type { PreviewData, PreviewMeta } from "im-shared/types";
import { loadJson, loadRidershipData } from "./parse";
import { simulate } from "./simulation";
import type { EventRecord, LineMeta } from "./types";

const DATA_DIR = path.join(process.cwd(), "../../data");
const INPUT_META_PATH = path.join(DATA_DIR, "lines-meta.json");
const INPUT_LAYOUT_PATH = path.join(DATA_DIR, "lines-layout.json");
const INPUT_EVENTS_PATH = path.join(DATA_DIR, "events.json");
const INPUT_CSV_PATH = path.join(DATA_DIR, "ridership.csv");
const OUT_PATH = path.join(DATA_DIR, "../packages/preview/public/preview-data.json");

const CONFIG = {
  width: 1920,
  height: 1080,
  lineTop: 50, // y position of top of lines
  lineBottom: 1080 - 105, // y position of bottom of lines
  branchOffset: 50, // x offset between main and branch stems
  headY: 1080 - 48,
};

/**
 * Generate an array of ISO date strings from startDate to endDate (exclusive)
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  // Add the day before start to properly reflect events occurring on startDate
  current.setDate(current.getDate() - 1);

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
  if (firstEventDate && firstRidershipDate && firstEventDate <= firstRidershipDate) {
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
  const linesLayout = await loadJson<Record<string, Partial<LineMeta>>>(INPUT_LAYOUT_PATH);
  const eventsRaw = await loadJson<EventRecord[]>(INPUT_EVENTS_PATH);

  // Merge layout data into linesMeta
  for (const line of linesMeta) {
    if (linesLayout[line.id]) {
      Object.assign(line, linesLayout[line.id]);
    }
  }

  // Load computed CSV ridership (expected to be present in /output/ridership.csv)
  const { ridershipMap, sortedDays } = await loadRidershipData(INPUT_CSV_PATH);

  const allDays = extendDummyDays(sortedDays, eventsRaw);

  // Run simulation to generate PreviewData
  const { linesData, totalRiderships } = simulate(
    ridershipMap,
    allDays,
    eventsRaw,
    linesMeta,
    CONFIG,
  );

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
