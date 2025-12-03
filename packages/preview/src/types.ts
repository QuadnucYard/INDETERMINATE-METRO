// Preview IR types - mirrors the IR structure from resolve package

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

export interface StationIR {
  id: string;
  name: string;
  translation?: string;
  existsFromDay: number;
  positions: StationPoint[];
  service?: StatePoint[];
}

export interface LineIR {
  id: string;
  name?: string;
  colorHex: string;
  x: number;
  ridership: number[]; // raw ridership in 万人 (10k passengers) per day
  statePoints: StatePoint[];
  stations: StationIR[];
}

export interface IRMeta {
  width: number;
  height: number;
  days: string[];
}

export interface PreviewIR {
  meta: IRMeta;
  lines: Record<string, LineIR>;
}

export interface RenderStyle {
  widthScale: number;
  showLabels: boolean;
}
