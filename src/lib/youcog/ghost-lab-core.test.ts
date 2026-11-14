import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_SLOT_COUNTS, SLOT_ORDER, itemsOf, outfitToTraits, traitsToOutfit, labStatus, publicLeft, mintsLeft, freeLeft, ghostsMintLines, formatYoucogPrice, decodeTokenUri, toggleOutfitItem, encodeLabOutfit, decodeLabOutfit, hasContestItems, parseTraitsParam, parseWearParam, stripContestItems, labGhostPath } from "./ghost-lab-core";
import { DEFAULT_OUTFIT, COSMETICS, CONTEST_COSMETICS, isContestId } from "./ghost-wardrobe";

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
  assert.equal(mintsLeft(1000, 1), 999);
  assert.equal(mintsLeft(1000, 1000), 0);
  assert.equal(mintsLeft(1000, 1001), 0);
  assert.equal(freeLeft(100, 1), 99);
  assert.equal(freeLeft(100, 100), 0);
  assert.equal(freeLeft(100, 150), 0);
});
test("decodes tokenURI", () => {
  const j = JSON.stringify({ name: "Youcognito Ghost #2", image: "data:image/svg+xml;base64,AA==" });
  const u = "data:application/json;base64," + Buffer.from(j).toString("base64");
  assert.equal(decodeTokenUri(u).name, "Youcognito Ghost #2");
});

test("try-on equips and unequips without ownership", () => {
  const on = toggleOutfitItem({}, "crown");
  assert.equal(on.hat, "crown");
  const off = toggleOutfitItem(on, "crown");
  assert.equal(off.hat, undefined);
  assert.deepEqual(toggleOutfitItem({}, "not-a-real-item"), {});
});

test("mint tile copy: gas when price is 0, paid price, and fallback", () => {
  const gas = ghostsMintLines({ minted: 1, max: 1000, left: 999, freeUntil: 100, freeLeft: 99, priceWei: "0" });
  assert.deepEqual(gas, { ok: true, remaining: "999/1000", feeLine: "Just pay a small gas fee", priceLine: null });
  const paid = ghostsMintLines({ minted: 100, max: 1000, left: 900, freeUntil: 100, freeLeft: 0, priceWei: (10n ** 18n * 2500n).toString() });
  assert.equal(paid.ok, true);
  if (paid.ok) {
    assert.equal(paid.remaining, "900/1000");
    assert.equal(paid.feeLine, null);
    assert.equal(paid.priceLine, "2,500 YOUCOG");
  }
  assert.equal(formatYoucogPrice(0n), "Free (gas only)");
  assert.deepEqual(ghostsMintLines(null), { ok: false });
});


test("contest items are off-chain and cannot be encoded as mint traits", () => {
  assert.ok(CONTEST_COSMETICS.length >= 24);
  assert.ok(CONTEST_COSMETICS.every((c) => c.contest && isContestId(c.id)));
  assert.equal(isContestId("fedora-white"), false);
  const mixed = { ...DEFAULT_OUTFIT, hat: "horns", bg: "bg-stars" };
  assert.equal(hasContestItems(mixed), true);
  assert.equal(hasContestItems(DEFAULT_OUTFIT), false);
  assert.throws(() => outfitToTraits(mixed), /Contest-only/);
  const stripped = stripContestItems(mixed);
  assert.equal(stripped.hat, undefined);
  assert.equal(stripped.bg, undefined);
  assert.equal(stripped.shades, "shades-black");
  assert.deepEqual(outfitToTraits(stripped), [0, 1, 1, 0, 0, 0]);
});

test("traits and wear params round-trip, including contest items", () => {
  assert.deepEqual(parseTraitsParam("1,1,1,0,0,0"), [1, 1, 1, 0, 0, 0]);
  assert.deepEqual(parseTraitsParam("1-1-1-0-0-0"), [1, 1, 1, 0, 0, 0]);
  assert.equal(parseTraitsParam("1,1,1,0,0,9"), null);
  assert.equal(parseTraitsParam("nope"), null);
  const onChain = encodeLabOutfit(DEFAULT_OUTFIT);
  assert.equal(onChain, "traits:1,1,1,0,0,0");
  assert.deepEqual(decodeLabOutfit(onChain), DEFAULT_OUTFIT);
  assert.equal(labGhostPath(DEFAULT_OUTFIT), "/api/ghost-image?traits=1%2C1%2C1%2C0%2C0%2C0");
  const contest = { ...DEFAULT_OUTFIT, hat: "horns", bg: "bg-checker" };
  const wear = encodeLabOutfit(contest);
  assert.equal(wear.startsWith("wear:"), true);
  assert.deepEqual(decodeLabOutfit(wear), contest);
  assert.ok(labGhostPath(contest).includes("wear="));
  assert.ok(parseWearParam("horns,shades-black,skin-classic,bg-checker"));
  assert.equal(parseWearParam("not-a-real-item"), null);
});

test("toggle equips contest items too", () => {
  const on = toggleOutfitItem(DEFAULT_OUTFIT, "horns");
  assert.equal(on.hat, "horns");
  const bg = toggleOutfitItem(on, "bg-sunset");
  assert.equal(bg.bg, "bg-sunset");
  assert.equal(toggleOutfitItem(bg, "bg-sunset").bg, undefined);
});
