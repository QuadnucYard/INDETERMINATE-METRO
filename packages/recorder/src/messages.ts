export interface StartMessage {
  type: "start";
  frameRate?: number;
  width?: number;
  height?: number;
  name?: string;
}

export interface EndMessage {
  type: "end";
}

export type IncomingMessage = StartMessage | EndMessage;

export interface StartedMessage {
  type: "started";
  outputFile: string;
}

export interface EndedMessage {
  type: "ended";
  frameCount: number;
  duration: number;
  outputFile: string;
}

export interface ProgressMessage {
  type: "progress";
  frameCount: number;
  elapsed: number;
  fps: number;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type OutgoingMessage = StartedMessage | EndedMessage | ProgressMessage | ErrorMessage;
