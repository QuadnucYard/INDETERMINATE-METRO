export type LineMeta = {
  id: string; // line ID, e.g. "1", "S1", etc.
  color: string; // hex color, e.g. "#ff0000"
  x?: number; // desired x position in pixels
  stations: [string, string][]; // list of [station name, translation] pairs
  branchStations?: [string, string][]; // optional list of branch line stations
};

export type EventRecord = {
  date: string; // "YYYY-MM-DD"
  line: string; // line ID, e.g. "1", "S1", etc.
  type: "open" | "close" | "suspend" | "resume";
  stations: StationsSpec;
  fullStations?: StationsSpec; // optional full list of stations for openings
};

export type StationsSpec =
  | { from: string; to: string; except?: string[] } // range from 'from' to 'to', with optional exceptions
  | string[]; // list of station names

// ===

export type AEKeyframe = {
  time: number; // seconds
  count: number; // original value (万)
  width: number; // px
  opacity: number; // 0..1
};

export type AELine = {
  id: string;
  name: string;
  x: number;
  color: [number, number, number];
  keyframes: AEKeyframe[];
};

export type AEInput = {
  meta: {
    compW: number;
    compH: number;
    fps: number;
    secondsPerDayDefault: number;
    durationSeconds: number;
    minStrokePx: number;
    maxStrokePx: number;
    stationDotBaseSize: number;
  };
  days: string[]; // ISO dates
  lines: Record<string, AELine>;
  events: EventRecord[];
};
