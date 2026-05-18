import { randomBytes } from "node:crypto";

// 12 bytes = 96 bits of entropy → unguessable. URL-safe base64.
export function generateShareToken(): string {
  return randomBytes(12).toString("base64url");
}
