import fs from "node:fs/promises";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
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
  const argv = yargs(hideBin(process.argv))
    .option("starttime", {
      alias: "s",
      type: "string",
      describe: "Start time (ISO date string, e.g., 2023-01-01)",
    })
    .option("endtime", {
      alias: "e",
      type: "string",
      describe: "End time (ISO date string, e.g., 2023-12-31)",
    })
    .option("stop-on-exist", {
      alias: "o",
      type: "boolean",
      describe: "Stop crawling when encountering existing entries",
    })
    .option("cookie", {
      alias: "c",
      type: "string",
      describe: "Cookie string for authentication",
    })
    .option("max-pages", {
      type: "number",
      describe: "Maximum number of pages to crawl",
    })
    .strict()
    .help()
    .parse() as {
    starttime?: string;
    endtime?: string;
    "stop-on-exist"?: boolean;
    cookie?: string;
    "max-pages"?: number;
  };

  let startTime: number | undefined;
  if (argv.starttime) {
    const d = new Date(argv.starttime);
    if (!Number.isNaN(d.getTime())) {
      startTime = Math.floor(d.getTime() / 1000);
    } else {
      console.error(`Invalid date for starttime: ${argv.starttime}`);
      process.exit(1);
    }
  }

  let endTime: number | undefined;
  if (argv.endtime) {
    const d = new Date(argv.endtime);
    if (!Number.isNaN(d.getTime())) {
      endTime = Math.floor(d.getTime() / 1000);
    } else {
      console.error(`Invalid date for endtime: ${argv.endtime}`);
      process.exit(1);
    }
  }

  return {
    startTime,
    endTime,
    stopOnExist: argv["stop-on-exist"] ?? false,
    cookieOverride: argv.cookie,
    maxPagesOverride: argv["max-pages"],
  };
}

async function main() {
  const {
    startTime: parsedStartTime,
    endTime,
    stopOnExist,
    cookieOverride,
    maxPagesOverride,
  } = parseArgs();

  const cookie = cookieOverride ?? (await getCookie());
  const existingData = await loadExistingData();

  let startTime = parsedStartTime;
  if (!startTime && existingData.length > 0) {
    const latestDate = Math.max(...existingData.map((d) => Date.parse(d.date)));
    startTime = Math.floor(latestDate / 1000);
    console.log(
      `No starttime provided, fetching since last update: ${new Date(latestDate).toISOString()}`,
    );
  }

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
    // Backup existing data
    try {
      const backupPath = `${RIDERSHIP_JSON_PATH}.bak`;
      await fs.copyFile(RIDERSHIP_JSON_PATH, backupPath);
      console.log(`Backed up existing data to ${backupPath}`);
    } catch (e) {
      console.warn("Failed to backup existing data:", e);
    }
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
