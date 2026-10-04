import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { MAX_EXCHANGE_BYTES } from "./result-exchange";

/** Check regular file and bounded read before parsing, preserving valid UTF-8 exactly. */
export function readBoundedUtf8(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_EXCHANGE_BYTES)
      throw new Error("exchange:file-type-or-size");
    const buffer = Buffer.alloc(MAX_EXCHANGE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_EXCHANGE_BYTES) throw new Error("exchange:file-too-large");
    // ignoreBOM preserves a literal BOM; JSON.parse then rejects it rather than silently changing bytes.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      buffer.subarray(0, length),
    );
  } finally {
    closeSync(fd);
  }
}
export function freshDirectory(path: string): string {
  const root = resolve(path);
  mkdirSync(dirname(root), { recursive: true });
  mkdirSync(root, { recursive: false, mode: 0o700 });
  return root;
}
export function writeFresh(path: string, value: string) {
  writeFileSync(path, value, { flag: "wx", mode: 0o600 });
}
export function writeFreshJson(path: string, value: unknown) {
  writeFresh(path, JSON.stringify(value, null, 2) + "\n");
}
