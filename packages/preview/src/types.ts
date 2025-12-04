// Preview IR types - mirrors the IR structure from resolve package

export type Rect = {
  width: number;
  height: number;
};

export enum ServiceState {
  Never = 0,
  Open = 1,
  Suspended = 2,
  Closed = 3,
}

export interface StatePoint {
  day: number;
  state: ServiceState;
}

export interface StationPoint {
  day: number;
  y: number;
}

export interface StationData {
  id: string;
  name: string;
  translation?: string;
  existsFromDay: number;
  positions: StationPoint[];
  service?: StatePoint[];
}

export interface LineData {
  id: string;
  name?: string;
  colorHex: string;
  x: number;
  ridership: number[]; // raw ridership in 万人 (10k passengers) per day
  statePoints: StatePoint[];
  stations: StationData[];
}

export interface PreviewMeta {
  width: number;
  height: number;
  days: string[];
}

export interface PreviewData {
  meta: PreviewMeta;
  lines: Record<string, LineData>;
}

export interface RenderStyle {
  widthScale: number;
  showLabels: boolean;
}
