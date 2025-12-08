import fs from "node:fs/promises";
import path from "node:path";
import { parseRidershipData } from "./parse-post";
import type { RawEntry, RidershipEntry } from "./types";
import { checkDateContinuity, checkTotalConsistency } from "./validate";

export const TOTAL = "total";

const DATA_DIR = path.join(process.cwd(), "../../data");
const INPUT_DATA_PATH = path.join(DATA_DIR, "ridership.json");
const INPUT_PATCH_PATH = path.join(DATA_DIR, "ridership.patch.json");
const OUTPUT_CSV_PATH = path.join(DATA_DIR, "ridership.csv");

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
  if (await fs.exists(INPUT_PATCH_PATH)) {
    const patchRidership = JSON.parse(await fs.readFile(INPUT_PATCH_PATH, "utf8")) as RawEntry[];
    console.log(`Applying ${patchRidership.length} patched entries from ${INPUT_PATCH_PATH}`);
    rawRidership.push(...patchRidership);
  }

  const { ridershipData, allLineIds } = parseRidershipData(rawRidership);
  console.log(`Total days: ${ridershipData.length}`);
  console.log(`Lines: ${allLineIds}`);

  // Validation
  checkDateContinuity(ridershipData);
  checkTotalConsistency(ridershipData);

  console.log("Generating CSV...");
  const csvContent = dumpRidershipCSV(ridershipData, allLineIds);
  await fs.writeFile(OUTPUT_CSV_PATH, csvContent, "utf8");
  console.log(`Wrote CSV to ${OUTPUT_CSV_PATH}`);
}

main().catch(console.error);
