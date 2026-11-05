import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_TREE, layoutTree } from "./map-data";
test("map layout: unique ids, every non-root has a placed parent", () => {
  const p = layoutTree(MAP_TREE);
  const ids = new Set(p.map((x) => x.id));
  assert.equal(ids.size, p.length);
  for (const x of p) if (x.id !== "root") assert.ok(x.parent && ids.has(x.parent));
});
