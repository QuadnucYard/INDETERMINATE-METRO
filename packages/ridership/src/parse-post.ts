import * as _ from "radash";
import { parsePostContent } from "./parse-content";
import type { RawEntry, RidershipEntry } from "./types";

export function parseRidershipData(rawRidership: RawEntry[]) {
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
