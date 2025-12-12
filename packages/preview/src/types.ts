import type { ServiceState, StationData, StationId, Vec2 } from "im-shared/types";

export * from "im-shared/types";

export type Ref<T> = { val: T };

export type Vec2Ref = Ref<Vec2 | undefined>;

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

export type PositionRefMap = Map<StationId, Vec2Ref>; // StationUid -> Vec2Ref
