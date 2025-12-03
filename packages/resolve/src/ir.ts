// types/ir.ts

/** ---------- Small enums / primitives ---------- */

/** Service state for a line or station (stored as small integers for cheap AE expressions). */
export enum ServiceState {
  Never = 0, // never-opened (do not create / display)
  Open = 1, // normal operation (opaque)
  Suspended = 2, // temporarily suspended (semi-transparent)
  Closed = 3, // permanently closed from this day onward (hide)
}

export type Point = { day: number /* day index, 0-based */; value: number };

export type StatePoint = { day: number; state: number }; // ServiceState ints: 0=Never/Closed, 1=Open, 2=Suspended

export type StationPoint = { day: number; y: number };

export type StationIR = {
  id: string;
  name: string;
  translation?: string;
  existsFromDay: number;
  // sparse position change points (sorted by day)
  positions: StationPoint[];
  // optional sparse service points (small)
  service?: StatePoint[];
};

export type LineIR = {
  id: string;
  name?: string;
  colorHex: string;
  x: number;
  // raw ridership counts in 万人 (10k passengers) per day
  ridership: number[];
  statePoints: StatePoint[]; // sparse state transitions; sample discrete state
  stations: StationIR[];
  parentLineId?: string | null;
  // other debug fields optional
};

export type IRMeta = {
  width: number;
  height: number;
  days: string[]; // ISO day strings; dayIndex = index
};

export type PreviewIR = {
  meta: IRMeta;
  lines: Record<string, LineIR>;
};

/** ---------- Bake-mode augmentation ---------- */

/**
 * Bake-mode IR is the same as PreviewIR but optionally includes 'bakedKeyframes'.
 * In practice the Bake-mode AE script will convert the per-day arrays into AE keyframes at
 * times t = dayIndex (units of 'day', i.e., 1 = 1 second) and set Easy Ease.
 *
 * The baked keyframes are optional — if present they list only change points for absolute speed.
 */
export type KeyframePoint = { dayIndex: number; value: number };

export interface LineBakeInfo {
  /** stroke width keyframes (sparse: only days where width differs or every day if desired). */
  widthKeyframes?: KeyframePoint[];

  /** head Y-offset keyframes. */
  headKeyframes?: KeyframePoint[];

  /** layer opacity keyframes (0..100) for the line itself (reflects suspended/closed states). */
  opacityKeyframes?: KeyframePoint[];

  /** per-station baked position keyframes (stationId => array of keyframes). */
  stationPositionKeyframes?: Record<string, KeyframePoint[]>;
}

/** Bake IR extends PreviewIR with optional per-line bake info. */
export interface BakeIR extends PreviewIR {
  bake?: {
    /** optional per-line bake info */
    lines?: Record<string, LineBakeInfo>;
    /** recommended frame interpolation: "ease" | "linear" */
    interpolation?: "ease" | "linear";
  };
}
