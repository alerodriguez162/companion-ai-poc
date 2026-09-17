export function log(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const line = {
    level,
    message,
    ts: new Date().toISOString(),
    service: "api",
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}
