import fs from "node:fs/promises";

export const loadJson = async <T>(p: string): Promise<T | null> => {
  try {
    const txt = await fs.readFile(p, "utf8");
    return JSON.parse(txt) as T;
  } catch (err) {
    console.error(`Failed to load JSON from ${p}:`, err);
    return null;
  }
};

export async function loadRidershipData(csvPath: string) {
  const csv = await fs.readFile(csvPath, "utf8");

  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const headerLine = lines.shift();
  if (!headerLine) {
    return { ridershipMap: new Map(), sortedDays: [], allLineIds: [] };
  }
  const header = headerLine.split(",").map((s) => s.trim());
  // header: date,  <line ids...>

  const ridershipMap = new Map<string, Record<string, number>>();
  const dates: string[] = [];
  for (const line of lines) {
    const row = line.split(",");
    if (row.length < 1) continue;
    const date = (row[0] ?? "").trim();
    if (!date) continue;
    const counts: Record<string, number> = {};
    for (let ci = 1; ci < header.length; ci++) {
      const id = header[ci] as string;
      const v = row[ci] as string;
      if (v !== "") counts[id] = Number(v);
    }
    ridershipMap.set(date, counts);
    dates.push(date);
  }

  // sort the dates ascending
  const sortedDays = Array.from(new Set(dates)).sort();

  return { ridershipMap, sortedDays };
}
