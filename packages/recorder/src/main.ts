import { join } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { RecordingServer } from "./server";

interface Argv {
  port: number;
  "output-dir": string;
  preset: string;
  crf: number;
}

const argv = yargs(hideBin(process.argv))
  .option("port", {
    alias: "p",
    type: "number",
    description: "Port to run the server on",
    default: 9090,
  })
  .option("output-dir", {
    alias: "o",
    type: "string",
    description: "Output directory for videos",
    default: join(process.cwd(), "output", "videos"),
  })
  .option("preset", {
    type: "string",
    description: "FFmpeg encoding preset",
    default: "medium",
    choices: [
      "ultrafast",
      "superfast",
      "veryfast",
      "faster",
      "fast",
      "medium",
      "slow",
      "slower",
      "veryslow",
    ],
  })
  .option("crf", {
    type: "number",
    description: "FFmpeg constant rate factor (quality)",
    default: 18,
  })
  .help().argv as Argv;

const server = new RecordingServer(argv.port, argv["output-dir"], {
  preset: argv.preset,
  crf: argv.crf,
});
server.start();
