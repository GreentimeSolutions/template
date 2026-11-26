import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseZombieLabSupply, zombieLabMintAria, zombieLabMintLines } from "./zombie-lab-supply.ts";

describe("zombie-lab-supply", () => {
  it("parses a live-shaped payload and formats like the Ghost Lab counter", () => {
    const s = parseZombieLabSupply({ left: 58870, max: 58900 });
    assert.deepEqual(s, { left: 58870, max: 58900 });
    const lines = zombieLabMintLines(s);
    assert.deepEqual(lines, {
      ok: true,
      remaining: "58,870/58,900",
      feeLine: "Just pay a small gas fee to mint a pack",
    });
    assert.equal(
      zombieLabMintAria(lines),
      "Mint a Zombie Lab pack, 58,870/58,900 remaining, Just pay a small gas fee to mint a pack",
    );
  });

  it("rejects missing, inverted, or non-integer counts instead of inventing a number", () => {
    assert.equal(parseZombieLabSupply(null), null);
    assert.equal(parseZombieLabSupply({ left: 1 }), null);
    assert.equal(parseZombieLabSupply({ left: 10, max: 5 }), null);
    assert.equal(parseZombieLabSupply({ left: 1.5, max: 10 }), null);
    assert.equal(zombieLabMintLines(null).ok, false);
    assert.equal(zombieLabMintAria({ ok: false }), "Mint a Zombie Lab pack");
  });
});
