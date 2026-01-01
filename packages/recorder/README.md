# Recorder

A WebSocket-based video recording server using FFmpeg.

## Installation

```bash
bun install
```

## Usage

Start the server:

```bash
bun run start --port 9090 --output-dir ./videos --preset fast --crf 20
```

### CLI Options

- `-p, --port`: Port to run the server on (default: 9090)
- `-o, --output-dir`: Output directory for videos (default: ./output/videos)
- `--preset`: FFmpeg encoding preset (default: medium)
- `--crf`: FFmpeg constant rate factor (quality, 0-51, default: 18)

## WebSocket API

Connect to `ws://localhost:9090` and send JSON messages.

### Messages

#### Start Recording

```json
{
  "type": "start",
  "frameRate": 60,
  "width": 1920,
  "height": 1080,
  "name": "myvideo"
}
```

- `frameRate`: Frames per second (default: 60)
- `width`: Video width (default: 1920)
- `height`: Video height (default: 1080)
- `name`: Optional video name

#### End Recording

```json
{
  "type": "end"
}
```

#### Responses

- Started: `{"type": "started", "outputFile": "path/to/video.mp4"}`
- Progress: `{"type": "progress", "frameCount": 120, "elapsed": 2.0, "fps": 60}`
- Ended: `{"type": "ended", "frameCount": 3600, "duration": 60.0, "outputFile": "path/to/video.mp4"}`
- Error: `{"type": "error", "message": "Error description"}`

Send JPEG frames as binary data after starting a recording.
