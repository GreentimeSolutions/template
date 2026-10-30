import { test } from "node:test";
import assert from "node:assert/strict";
import { Attribution } from "ox/erc8021";
import { BUILDER_CODE, DATA_SUFFIX, withSuffix } from "./builder-code.ts";

test("suffix is a valid ERC-8021 schema-0 suffix carrying the app code", () => {
  assert.ok(DATA_SUFFIX.toLowerCase().endsWith("80218021802180218021802180218021"));
  const parsed = Attribution.fromData(withSuffix("0xa9059cbb"));
  assert.deepEqual(parsed?.codes, [BUILDER_CODE]);
});

test("withSuffix appends after calldata and works alone for plain transfers", () => {
  const data = "0x095ea7b3" + "00".repeat(64);
  assert.equal(withSuffix(data), data + DATA_SUFFIX.slice(2));
  assert.equal(withSuffix(), DATA_SUFFIX);
});
