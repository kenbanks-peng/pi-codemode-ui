import { isRecord } from "./value.ts";

export function isErrorOutput(value: unknown): boolean {
  return (
    isRecord(value) &&
    ((typeof value.exit_code === "number" && value.exit_code !== 0) || value.isError === true)
  );
}
