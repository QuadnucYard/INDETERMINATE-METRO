export type Vec2 = { readonly x: number; readonly y: number };

/** Service state for a line or station (stored as small integers for cheap AE expressions). */
export enum ServiceState {
  Never = 0, // never-opened (do not create / display)
  Open = 1, // normal operation (opaque)
  Suspended = 2, // temporarily suspended (semi-transparent)
  Closed = 3, // permanently closed from this day onward (hide)
}

export type Keyed<T> = Readonly<
  {
    /** day index, 0-based */
    readonly day: number;
  } & T
>;

export type KeyedArray<T> = Keyed<T>[];

export type KeyedState = Keyed<{ state: ServiceState }>;

export type StationPoint = Keyed<Vec2>;

export type LineId = string;
export type StationId = string;
export type StationName = string;

export type StationData = {
  /** Globally unique id for the station */
  id: StationId;
  name: string;
  translation?: string;
  // sparse position change points (sorted by day)
  positions: KeyedArray<Vec2>;
  // Sparse service points
  service: KeyedArray<{ state: ServiceState }>;
};

export type LineData = {
  id: LineId;
  name?: string;
  colorHex: string;
  x: number;
  /** The first day with ridership */
  firstDay?: number;
  /** raw ridership counts in 万人 (10k passengers) per day. Should be looked up with offset */
  ridership: number[];
  statePoints: KeyedState[]; // sparse state transitions; sample discrete state
  // sparse route segments: value is array of route objects
  routePoints: KeyedArray<{ value: RouteData[] }>;
  stations: StationData[];
};

export type RouteData = {
  stations: StationId[];
  /** The service state for edges in this route */
  state: ServiceState;
};

export type PreviewMeta = {
  width: number;
  height: number;
};

export type PreviewData = {
  meta: PreviewMeta;
  days: string[]; // ISO day strings; dayIndex = index
  totalRiderships: number[]; // total ridership per day in 万人
  lines: Record<LineId, LineData>;
};
