import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_OUTFIT } from "./ghost-wardrobe";
import { renderGhostPng, renderTraitsPng } from "./ghost-png";

function isPng(buf: Uint8Array) {
  return buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71 && buf[4] === 13 && buf[5] === 10 && buf[6] === 26 && buf[7] === 10;
}

function pngSize(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

test("renders a valid 512 PNG for default traits and a different contest outfit", () => {
  const a = renderTraitsPng([1, 1, 1, 0, 0, 0]);
  assert.ok(isPng(a));
  assert.deepEqual(pngSize(a), { width: 512, height: 512 });
  const b = renderGhostPng({ ...DEFAULT_OUTFIT, hat: "horns", bg: "bg-stars", prop: "prop-flag" });
  assert.ok(isPng(b));
  assert.deepEqual(pngSize(b), { width: 512, height: 512 });
  assert.notEqual(Buffer.from(a).toString("hex"), Buffer.from(b).toString("hex"));
  const small = renderGhostPng(DEFAULT_OUTFIT, { px: 6 });
  assert.deepEqual(pngSize(small), { width: 192, height: 192 });
});
