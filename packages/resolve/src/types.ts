import type { LineId, StationName } from "im-shared/types";

export type TrainHeadAtlas = {
  path: string; // atlas image filename
  region: { x: number; y: number; w: number; h: number }; // sprite region in atlas
};

export type LineMeta = {
  id: LineId; // line ID, e.g. "1", "S1", etc.
  color: string; // hex color, e.g. "#ff0000"
  x?: number; // desired x position in pixels
  head?: TrainHeadAtlas; // train head sprite atlas info
  stations: [StationName, string][]; // list of [station name, translation] pairs
  routes?: Route[];
  dummyRidership?: number; // optional dummy ridership value for days before ridership data starts
};

/** An array whose item is either a single station or an interval */
export type Route = (StationName | { from: StationName; to: StationName })[];

export type EventRecord = {
  date: string; // "YYYY-MM-DD"
  line: LineId; // line ID, e.g. "1", "S1", etc.
  type: "open" | "close" | "suspend" | "resume";
  stations: StationsSpec;
  fullStations?: StationsSpec; // optional full list of stations for openings
};

export type StationsSpec =
  | { from: StationName; to: StationName; except?: StationName[] } // range from 'from' to 'to', with optional exceptions
  | StationName[]; // list of station names
