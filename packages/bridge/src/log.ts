/** stdout belongs to MCP, so every log line goes to stderr. */
export function log(message: string): void {
  process.stderr.write(`autochrome-bridge: ${message}\n`);
}
