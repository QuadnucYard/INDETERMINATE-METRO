import { type ChildProcess, spawn } from "node:child_process";

export interface FfmpegOptions {
  preset: string;
  crf: number;
}

export class VideoWriter {
  private ffmpeg: ChildProcess;
  private outputFile: string;
  private frameCount: number = 0;
  private startTime: number;

  constructor(
    width: number,
    height: number,
    frameRate: number,
    outputFile: string,
    options: FfmpegOptions = { preset: "medium", crf: 18 },
  ) {
    this.outputFile = outputFile;
    this.startTime = Date.now();
    this.ffmpeg = this.startFFmpeg(width, height, frameRate, outputFile, options);
  }

  private startFFmpeg(
    width: number,
    height: number,
    frameRate: number,
    outputFile: string,
    options: FfmpegOptions,
  ): ChildProcess {
    console.log(`[FFmpeg] Starting encoding to ${outputFile}`);
    console.log(`[FFmpeg] Resolution: ${width}x${height} @ ${frameRate}fps`);

    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y", // Overwrite output file
        "-f",
        "image2pipe", // Input format: piped images
        "-c:v",
        "mjpeg", // Input codec: MJPEG (since we're sending JPEG frames)
        "-r",
        frameRate.toString(), // Input frame rate
        "-i",
        "-", // Read from stdin
        "-c:v",
        "libx264", // Output codec: H.264
        "-preset",
        options.preset,
        "-crf",
        options.crf.toString(),
        "-pix_fmt",
        "yuv420p", // Pixel format for broad compatibility
        "-movflags",
        "+faststart", // Enable fast start for web playback
        outputFile,
      ],
      {
        stdio: ["pipe", "inherit", "inherit"], // stdin=pipe, stdout/stderr=inherit
      },
    );

    ffmpeg.on("error", (error) => {
      console.error("[FFmpeg] Error:", error);
    });

    ffmpeg.on("close", (code) => {
      console.log(`[FFmpeg] Process exited with code ${code}`);
      if (code === 0) {
        console.log(`[FFmpeg] Video saved successfully: ${outputFile}`);
      }
    });

    return ffmpeg;
  }

  writeFrame(data: Buffer): void {
    if (this.ffmpeg.stdin?.writable) {
      this.ffmpeg.stdin.write(data);
      this.frameCount++;
    }
  }

  end(): void {
    this.ffmpeg.stdin?.end();
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getDuration(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  getOutputFile(): string {
    return this.outputFile;
  }
}
