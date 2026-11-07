import { sha256Hex } from "../../src/hash/sha256.js";

/** Browser stand-in for `node:crypto` in the mock rail. The ledger hash is pure JS. */
export function createHash(algorithm: string): {
  update(data: string): ReturnType<typeof createHash>;
  digest(encoding: "hex"): string;
} {
  if (algorithm !== "sha256") throw new Error(`unsupported hash ${algorithm}`);
  const parts: string[] = [];
  const hash = {
    update(data: string) {
      if (typeof data !== "string") throw new Error("the static demo hashes strings");
      parts.push(data);
      return hash;
    },
    digest(encoding: "hex") {
      if (encoding !== "hex") throw new Error(`unsupported digest ${encoding}`);
      return sha256Hex(parts.join(""));
    },
  };
  return hash;
}

export function randomUUID(): string {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.randomUUID) throw new Error("crypto.randomUUID is missing");
  return cryptoObj.randomUUID();
}
