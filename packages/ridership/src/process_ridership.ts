import fs from "node:fs/promises";
import path from "node:path";
import * as _ from "radash";

const DATA_DIR = path.join(process.cwd(), "../../data");
const INPUT_DATA_PATH = path.join(DATA_DIR, "ridership.json");
const OUTPUT_CSV_PATH = path.join(DATA_DIR, "ridership.csv");

type RawEntry = { date: string; content: string };

type RidershipEntry = {
  date: string; // ISO date
  rawDate: string; // original raw date string
  counts: Record<string, number>; // lineId -> count
};

export const parseContentToMap = (content: string): Record<string, number> => {
  // map simple Chinese numerals to digits
  const chineseMap: Record<string, string> = {
    一: "1",
    二: "2",
    三: "3",
    四: "4",
    五: "5",
    六: "6",
    七: "7",
    八: "8",
    九: "9",
    十: "10",
  };

  let s = content.replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",").replace(/。/g, ".");
  s = s.replace(/#.*?#/g, "");
  s = s.replace(/\(.*?\)/g, "");
  const out: Record<string, number> = {};
  // Match numeric lines like "1号线", "10号线", S-prefixed like "S1号线" and also special suffix "机场线".
  // We'll capture the whole name (including suffix) and numeric value, then strip suffixes and normalize.
  const re = /((?:S?\d+|[一二三四五六七八九十])(?:号线|号|机场线))\s*([0-9]+(?:\.[0-9]+)?)/g;
  for (;;) {
    const m = re.exec(s);
    if (!m) break;
    let name = (m[1] ?? "").trim();
    // strip a trailing '号线' or '机场线' so keys become '1', '10', 'S1', '一', '二' etc.
    name = name.replace(/(?:号线|号|机场线)$/, "").trim();
    // Normalise simple Chinese numerals -> numbers
    name = chineseMap[name] ?? name;

    const val = parseFloat(m[2] ?? "");
    if (!Number.isNaN(val)) {
      // Fixup known dirty/garbled ids: e.g. "73号线" is a common bad parse that should map to "3"
      const dirtyMap: Record<string, string> = { "73": "3" };
      const canonical = dirtyMap[name] ?? name;
      // heuristic: values > 1000 likely mean raw person counts -> convert into 万
      out[canonical] = val > 1000 ? val / 10000 : val;
    }
  }

  // Special-case: some entries mention '机场' (airport) without a line id like 'S1'.
  // Treat plain "机场 <num>" as S1 counts and aggregate.
  const reAirport = /机场(?!线)\s*([0-9]+(?:\.[0-9]+)?)/g;
  for (;;) {
    const m = reAirport.exec(s);
    if (!m) break;
    const val = parseFloat(m[1] ?? "");
    if (Number.isNaN(val)) continue;
    // biome-ignore lint/complexity/useLiteralKeys: special case
    out["S1"] = val > 1000 ? val / 10000 : val;
  }
  return out;
};

function parseRidershipData(rawRidership: RawEntry[]) {
  const ridershipData: RidershipEntry[] = [];
  const allLineIds = new Set<string>();

  for (const entry of rawRidership) {
    // subtract one day and use that as the entry date, adjusting for UTC+8
    const iso = new Date(entry.date);
    iso.setUTCHours(iso.getUTCHours() + 8); // adjust to UTC+8
    iso.setUTCDate(iso.getUTCDate() - 1);
    const isoLabel = iso.toISOString().slice(0, 10);

    const counts = parseContentToMap(entry.content);
    if (Object.keys(counts).length === 0) {
      // That message had no parsable data, skip it.
      continue;
    }
    for (const k of Object.keys(counts)) {
      allLineIds.add(k);
    }
    ridershipData.push({ date: isoLabel, rawDate: entry.date, counts: counts });
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
  let csvContent = `${["date", ...allLineIds].join(",")}\n`;
  for (const entry of ridershipData) {
    const row = [entry.date];
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
