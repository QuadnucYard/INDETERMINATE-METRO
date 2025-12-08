import type { RidershipEntry } from "./types";

export function checkDateContinuity(ridershipData: RidershipEntry[]) {
  const dates = ridershipData.map((entry) => new Date(entry.date));
  // Prints out any missing dates in the ridership data.
  const missingDates: string[] = [];
  for (let i = 1; i < dates.length; i++) {
    const prevDate = dates[i - 1] as Date;
    const currDate = dates[i] as Date;
    const expectedDate = new Date(prevDate);
    expectedDate.setDate(expectedDate.getDate() + 1);
    if (currDate.getTime() !== expectedDate.getTime()) {
      // Missing date(s) detected
      let missingDate = expectedDate;
      while (missingDate.getTime() < currDate.getTime()) {
        missingDates.push(missingDate.toISOString().slice(0, 10));
        missingDate = new Date(missingDate);
        missingDate.setDate(missingDate.getDate() + 1);
      }
    }
  }
  if (missingDates.length > 0) {
    console.log("Missing dates detected:", missingDates);
  } else {
    console.log("No missing dates detected.");
  }
}

export function checkTotalConsistency(ridershipData: RidershipEntry[]) {
  const inconsistentEntries: [RidershipEntry, number][] = [];
  for (const entry of ridershipData) {
    const sum = Object.values(entry.counts).reduce((a, b) => a + b, 0);
    // Check approximate equality to avoid floating point issues
    // Note that all numbers are rounded to 0.1 here.
    if (Math.abs(sum - entry.total) > 0.5 * Math.max(1, Object.keys(entry.counts).length)) {
      inconsistentEntries.push([entry, sum]);
    }
  }
  if (inconsistentEntries.length > 0) {
    console.log(
      `Found ${inconsistentEntries.length} inconsistent total entries detected:`,
      inconsistentEntries,
    );
  } else {
    console.log("All entries have consistent totals.");
  }
}
