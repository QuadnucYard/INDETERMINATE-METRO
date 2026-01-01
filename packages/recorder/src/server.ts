import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";
import type {
  EndedMessage,
  ErrorMessage,
  IncomingMessage,
  ProgressMessage,
  StartedMessage,
  StartMessage,
} from "./messages";
import { type FfmpegOptions, VideoWriter } from "./video-writer";

interface RecordingSession {
  writer: VideoWriter;
}

export class RecordingServer {
  private wss?: WebSocketServer;
  private sessions: Map<WebSocket, RecordingSession>;
  private port: number;
  private outputDir: string;
  private ffmpegOptions: FfmpegOptions;

  constructor(
    port: number,
    outputDir: string,
    ffmpegOptions: FfmpegOptions = { preset: "medium", crf: 18 },
  ) {
    this.port = port;
    this.outputDir = outputDir;
    this.ffmpegOptions = ffmpegOptions;
    this.sessions = new Map();

    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  start(): void {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on("listening", this.onListening.bind(this));
    this.wss.on("error", this.onError.bind(this));
    this.wss.on("connection", this.onConnection.bind(this));

    // Graceful shutdown
    process.on("SIGINT", this.shutdown.bind(this));
  }

  private onListening(): void {
    console.log(`[Server] Video encoding server running on ws://localhost:${this.port}`);
    console.log(`[Server] Output directory: ${this.outputDir}`);
  }

  private onError(error: NodeJS.ErrnoException): void {
    if (error.code === "EADDRINUSE") {
      console.error(`[Server] Error: Port ${this.port} is already in use.`);
      console.error(`[Server] Please close the other process or use a different port:`);
      console.error(`[Server]   PORT=8081 bun run start`);
    } else {
      console.error(`[Server] Error:`, error);
    }
    process.exit(1);
  }

  private onConnection(ws: WebSocket): void {
    console.log("[Server] Client connected");

    ws.on("message", (data, isBinary) => this.handleMessage(ws, data, isBinary));
    ws.on("close", () => this.handleClose(ws));
    ws.on("error", (error) => this.handleWsError(error));
  }

  private handleMessage(ws: WebSocket, data: WebSocket.RawData, isBinary: boolean): void {
    const session = this.sessions.get(ws);
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);

    if (!isBinary) {
      try {
        const message = JSON.parse(buffer.toString()) as IncomingMessage;
        this.handleTextMessage(ws, message, session);
      } catch (error) {
        console.error("[Server] Error parsing text message:", error);
      }
    } else {
      this.handleBinaryMessage(ws, buffer, session);
    }
  }

  private handleTextMessage(
    ws: WebSocket,
    message: IncomingMessage,
    session?: RecordingSession,
  ): void {
    console.log(`[Server] Handling text message:`, message);

    if (message.type === "start") {
      this.startRecording(ws, message);
    } else if (message.type === "end") {
      this.endRecording(ws, session);
    }
  }

  private handleBinaryMessage(ws: WebSocket, data: Buffer, session?: RecordingSession): void {
    if (!session) return;

    session.writer.writeFrame(data);

    // Log progress every 60 frames (1 second at 60fps)
    if (session.writer.getFrameCount() % 60 === 0) {
      this.sendProgressUpdate(ws, session);
    }
  }

  private startRecording(ws: WebSocket, message: StartMessage): void {
    const { frameRate = 60, width = 1920, height = 1080, name } = message;

    // Input validation
    if (frameRate <= 0 || !Number.isInteger(frameRate)) {
      this.sendError(ws, "Invalid frameRate: must be a positive integer");
      return;
    }
    if (width <= 0 || !Number.isInteger(width)) {
      this.sendError(ws, "Invalid width: must be a positive integer");
      return;
    }
    if (height <= 0 || !Number.isInteger(height)) {
      this.sendError(ws, "Invalid height: must be a positive integer");
      return;
    }
    if (name && (typeof name !== "string" || name.length === 0)) {
      this.sendError(ws, "Invalid name: must be a non-empty string");
      return;
    }

    const outputFile = createOutputFileName(name || "recording", this.outputDir);

    try {
      const writer = new VideoWriter(width, height, frameRate, outputFile, this.ffmpegOptions);

      this.sessions.set(ws, { writer });

      console.log(`[Server] Recording session started: ${name}`);

      // Send acknowledgment
      const response: StartedMessage = { type: "started", outputFile: writer.getOutputFile() };
      ws.send(JSON.stringify(response));
    } catch (error) {
      console.error("[Server] Failed to start recording:", error);
      this.sendError(ws, "Failed to start FFmpeg process");
    }
  }

  private endRecording(ws: WebSocket, session?: RecordingSession): void {
    if (!session) return;

    const duration = session.writer.getDuration();
    const frameCount = session.writer.getFrameCount();
    console.log(
      `[Server] Recording ended. Duration: ${duration.toFixed(2)}s, Frames: ${frameCount}`,
    );

    session.writer.end();
    this.sessions.delete(ws);

    // Send acknowledgment
    const response: EndedMessage = {
      type: "ended",
      frameCount,
      duration,
      outputFile: session.writer.getOutputFile(),
    };
    ws.send(JSON.stringify(response));
  }

  private sendProgressUpdate(ws: WebSocket, session: RecordingSession): void {
    const frameCount = session.writer.getFrameCount();
    const elapsed = session.writer.getDuration();
    console.log(`[Server] Progress: ${frameCount} frames (${elapsed.toFixed(1)}s)`);

    // Send progress update to client
    const response: ProgressMessage = {
      type: "progress",
      frameCount,
      elapsed,
      fps: frameCount / elapsed,
    };
    ws.send(JSON.stringify(response));
  }

  private sendError(ws: WebSocket, message: string): void {
    const response: ErrorMessage = { type: "error", message };
    ws.send(JSON.stringify(response));
  }

  private handleClose(ws: WebSocket): void {
    console.log("[Server] Client disconnected");
    const session = this.sessions.get(ws);
    if (session) {
      console.log("[Server] Cleaning up session");
      session.writer.end();
      this.sessions.delete(ws);
    }
  }

  private handleWsError(error: Error): void {
    console.error("[Server] WebSocket error:", error);
  }

  private shutdown(): void {
    console.log("\n[Server] Shutting down...");

    // Close all sessions
    for (const [ws, session] of this.sessions.entries()) {
      console.log(`[Server] Closing session: ${session.writer.getOutputFile()}`);
      session.writer.end();
      ws.close();
    }

    this.wss?.close(() => {
      console.log("[Server] Server closed");
      process.exit(0);
    });
  }
}

function createOutputFileName(prefix: string = "recording", outputDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  return join(outputDir, `${prefix}_${timestamp}.mp4`);
}
