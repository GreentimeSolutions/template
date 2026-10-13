import { Attribution } from "ox/erc8021";

/** Base Builder Code (ERC-8021) attribution suffix appended to every tx calldata the app sends. */
export const BUILDER_CODE = "bc_q72p8qc9";
export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

/** Append the suffix to calldata (or use it alone for plain ETH transfers). */
export function withSuffix(data?: string): `0x${string}` {
  return `${data ?? "0x"}${DATA_SUFFIX.slice(2)}` as `0x${string}`;
}
