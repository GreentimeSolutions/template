import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_SLOT_COUNTS, SLOT_ORDER, itemsOf, outfitToTraits, traitsToOutfit, labStatus, publicLeft, decodeTokenUri } from "./ghost-lab-core";
import { DEFAULT_OUTFIT, COSMETICS } from "./ghost-wardrobe";

test("every wardrobe item maps to an on-chain trait (counts match contract)", () => {
  SLOT_ORDER.forEach((k, s) => assert.equal(itemsOf(k).length, CONTRACT_SLOT_COUNTS[s], k));
  assert.equal(COSMETICS.length, 38);
});
test("outfit <-> traits round trip", () => {
  assert.deepEqual(outfitToTraits({}), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(outfitToTraits(DEFAULT_OUTFIT), [1, 1, 1, 0, 0, 0]);
  for (const c of COSMETICS) {
    const t = outfitToTraits({ [c.cat]: c.id });
    assert.deepEqual(traitsToOutfit(t), { [c.cat]: c.id });
    assert.ok(t.every((v, s) => v <= CONTRACT_SLOT_COUNTS[s]));
  }
  assert.equal(outfitToTraits({ prop: "prop-duck" })[5], 6);
});
test("status mirrors contract checks", () => {
  const b = { paused: false, totalSupply: 1, reserveMinted: 1, hasMinted: false, price: 0n };
  assert.equal(labStatus({ ...b, paused: true }), "paused");
  assert.equal(labStatus({ ...b, totalSupply: 0, reserveMinted: 0 }), "not-started");
  assert.equal(labStatus({ ...b, hasMinted: true }), "already-minted");
  assert.equal(labStatus({ ...b, totalSupply: 991 }), "sold-out");
  assert.equal(labStatus({ ...b, totalSupply: 990 }), "open");
  assert.equal(publicLeft({ totalSupply: 1, reserveMinted: 1 }), 990);
});
test("decodes tokenURI", () => {
  const j = JSON.stringify({ name: "Youcognito Ghost #2", image: "data:image/svg+xml;base64,AA==" });
  const u = "data:application/json;base64," + Buffer.from(j).toString("base64");
  assert.equal(decodeTokenUri(u).name, "Youcognito Ghost #2");
});
