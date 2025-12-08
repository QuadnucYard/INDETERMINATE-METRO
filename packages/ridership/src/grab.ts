import fs from "node:fs/promises";
import path from "node:path";
import { crawl } from "./crawler";
import type { RawEntry } from "./types";

const DATA_DIR = path.join(process.cwd(), "../../data");
const RIDERSHIP_JSON_PATH = path.join(DATA_DIR, "ridership.json");
const COOKIE_PATH = path.join(process.cwd(), "cookie.txt");

async function getCookie(): Promise<string> {
  if (process.env.COOKIE) {
    return process.env.COOKIE;
  }
  try {
    const cookie = await fs.readFile(COOKIE_PATH, "utf-8");
    return cookie.trim();
  } catch {
    console.warn("No cookie found in process.env.COOKIE or cookie.txt. Requests may fail.");
    return "";
  }
}

async function loadExistingData(): Promise<RawEntry[]> {
  try {
    const data = await fs.readFile(RIDERSHIP_JSON_PATH, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to load existing data:", e);
    return [];
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let startTime: number | undefined;
  let endTime: number | undefined;
  let stopOnExist = false;
  let cookieOverride: string | undefined;
  let maxPagesOverride: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--starttime" || arg === "-s") {
      const val = args[++i];
      if (val) {
        const d = new Date(val);
        if (!Number.isNaN(d.getTime())) {
          startTime = Math.floor(d.getTime() / 1000);
          console.log(`Using starttime: ${d.toISOString()} (${startTime})`);
        } else {
          console.error(`Invalid date for starttime: ${val}`);
        }
      }
    } else if (arg === "--endtime" || arg === "-e") {
      const val = args[++i];
      if (val) {
        const d = new Date(val);
        if (!Number.isNaN(d.getTime())) {
          endTime = Math.floor(d.getTime() / 1000);
          console.log(`Using endtime: ${d.toISOString()} (${endTime})`);
        } else {
          console.error(`Invalid date for endtime: ${val}`);
        }
      }
    } else if (arg === "--stop-on-exist" || arg === "-o") {
      const val = args[i + 1];
      if (val && !val.startsWith("-")) {
        stopOnExist = val.toLowerCase() !== "false";
        i++;
      } else {
        stopOnExist = true;
      }
      console.log(`stopOnExist: ${stopOnExist}`);
    } else if (arg === "--cookie" || arg === "-c") {
      const val = args[++i];
      if (val) {
        cookieOverride = val;
      }
    } else if (arg === "--max-pages") {
      const val = args[++i];
      if (val) {
        const n = Number(val);
        if (!Number.isNaN(n) && n > 0) {
          maxPagesOverride = n;
        }
      }
    }
  }

  return { startTime, endTime, stopOnExist, cookieOverride, maxPagesOverride };
}

async function main() {
  const { startTime, endTime, stopOnExist, cookieOverride, maxPagesOverride } = parseArgs();

  const cookie = cookieOverride ?? (await getCookie());
  const existingData = await loadExistingData();

  // Create a set of existing dates for quick lookup
  // Using date + content snippet as a composite key might be safer, but date string is likely unique enough for Weibo posts
  const existingDates = new Set(existingData.map((d) => d.date));

  const newEntries = await crawl(
    { maxPages: maxPagesOverride, startTime, endTime },
    { cookie, stopOnExist },
    existingDates,
  );

  if (newEntries.length > 0) {
    console.log(`Found ${newEntries.length} new entries.`);
    // Merge new entries with existing data
    const updatedData = [...newEntries, ...existingData];

    // Sort by date descending
    updatedData.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

    await fs.writeFile(RIDERSHIP_JSON_PATH, JSON.stringify(updatedData, null, 2));
    console.log(`Updated ${RIDERSHIP_JSON_PATH}`);
  } else {
    console.log("No new entries found.");
  }
}

main().catch(console.error);
