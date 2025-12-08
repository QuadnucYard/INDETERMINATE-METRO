import fs from "node:fs/promises";
import path from "node:path";
import * as _ from "radash";
import { parsePostContent } from "./parse-content";

export const TOTAL = "total";

const DATA_DIR = path.join(process.cwd(), "../../data");
const INPUT_DATA_PATH = path.join(DATA_DIR, "ridership.json");
const OUTPUT_CSV_PATH = path.join(DATA_DIR, "ridership.csv");

type RawEntry = { date: string; content: string };

type RidershipEntry = {
  date: string; // ISO date
  rawDate: string; // original raw date string
  counts: Record<string, number>; // lineId -> count
  total: number;
};

function parseRidershipData(rawRidership: RawEntry[]) {
  const ridershipData: RidershipEntry[] = [];
  const allLineIds = new Set<string>();

  for (const entry of rawRidership) {
    if (
      !(
        entry.content.includes("昨日客流") ||
        entry.content.includes("客流报告") ||
        entry.content.includes("万人次")
      )
    ) {
      // That message had no parsable data, skip it.
      continue;
    }

    // subtract one day and use that as the entry date, adjusting for UTC+8
    const iso = new Date(entry.date);
    iso.setUTCHours(iso.getUTCHours() + 8); // adjust to UTC+8
    iso.setUTCDate(iso.getUTCDate() - 1);
    const isoLabel = iso.toISOString().slice(0, 10);

    const { counts, total } = parsePostContent(entry.content);
    if (Object.keys(counts).length === 0) {
      // No data parsed
      continue;
    }
    if (total === undefined) {
      console.warn(`Warning: no total found for entry on ${isoLabel} (${entry.date})`);
    }
    for (const k of Object.keys(counts)) {
      allLineIds.add(k);
    }
    ridershipData.push({ date: isoLabel, rawDate: entry.date, counts: counts, total: total ?? 0 });
  }

  ridershipData.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Sort numeric lines first (1,2,3,10...), then S+number (S1,S2...), then any leftovers.
  const sortedLineIds = _.sort(Array.from(allLineIds), (it) => {
    if (it.startsWith("S")) {
      return Number(it.slice(1)) + 10000;
    }
    return Number(it);
  });

  return { ridershipData, allLineIds: sortedLineIds };
}

function dumpRidershipCSV(ridershipData: RidershipEntry[], allLineIds: string[]): string {
  let csvContent = `${["date", TOTAL, ...allLineIds].join(",")}\n`;
  for (const entry of ridershipData) {
    const row = [entry.date, entry.total.toString() ?? ""];
    for (const id of allLineIds) {
      row.push(entry.counts[id]?.toString() ?? "");
    }
    csvContent += `${row.join(",")}\n`;
  }
  return csvContent;
}

async function main() {
  console.log("Loading data...");
  if (!(await fs.exists(INPUT_DATA_PATH))) {
    console.error("Input data not found:", INPUT_DATA_PATH);
    process.exit(1);
  }

  const rawRidership = JSON.parse(await fs.readFile(INPUT_DATA_PATH, "utf8")) as RawEntry[];

  const { ridershipData, allLineIds } = parseRidershipData(rawRidership);
  console.log(`Total days: ${ridershipData.length}`);
  console.log(`Lines: ${allLineIds}`);

  console.log("Generating CSV...");
  const csvContent = dumpRidershipCSV(ridershipData, allLineIds);
  await fs.writeFile(OUTPUT_CSV_PATH, csvContent, "utf8");
  console.log(`Wrote CSV to ${OUTPUT_CSV_PATH}`);
}

main().catch(console.error);
