import type { ServiceState, StationData, Vec2 } from "im-shared/types";

export * from "im-shared/types";

export type Rect = {
  width: number;
  height: number;
};

export interface RenderStyle {
  widthScale: number;
  showLabels: boolean;
}

export interface ActiveLineStations {
  readonly activeStations: {
    station: StationData;
    pos: Vec2;
    state: ServiceState;
  }[];
  readonly firstPos: Vec2;
  readonly lastPos: Vec2;
}
