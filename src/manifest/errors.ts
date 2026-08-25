/** Error codes prefixed `nor2r/` so callers can match programmatically. */
export type NoriErrorCode =
  | "nor2r/no-nori-input"
  | "nor2r/invalid-nori-json"
  | "nor2r/unsupported-kind";

export class NoriError extends Error {
  readonly code: NoriErrorCode;

  constructor(code: NoriErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "NoriError";
    this.code = code;
  }
}
