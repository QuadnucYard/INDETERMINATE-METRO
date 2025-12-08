export interface RawEntry {
  date: string;
  content: string;
}

export type RidershipEntry = {
  date: string; // ISO date
  rawDate: string; // original raw date string
  counts: Record<string, number>; // lineId -> count
  total: number;
};
