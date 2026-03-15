import fs from "fs";
import path from "path";

export interface ACPLogEntry {
  timestamp: number;
  type: string;
  data: unknown;
}

/**
 * Appends ACP events to a JSONL file for a given session.
 * Each line is a JSON object with timestamp, type, and data.
 */
export class ACPEventLogger {
  private stream: fs.WriteStream | null = null;
  readonly filePath: string;

  constructor(baseDir: string, sessionId: string) {
    const dir = path.join(baseDir, "sessions");
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, `${sessionId}.jsonl`);
    this.stream = fs.createWriteStream(this.filePath, { flags: "a" });
  }

  log(type: string, data: unknown): void {
    if (!this.stream) return;
    const entry: ACPLogEntry = { timestamp: Date.now(), type, data };
    this.stream.write(JSON.stringify(entry) + "\n");
  }

  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}
