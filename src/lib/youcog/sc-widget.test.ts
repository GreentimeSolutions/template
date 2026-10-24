import { test } from "node:test";
import assert from "node:assert/strict";
import { safeUnbindAll, SC_LISTEN_EVENTS } from "./sc-widget";

function widget(throwOnUnbind = false) {
  const calls: string[] = [];
  return {
    calls,
    unbind(ev: string) {
      if (throwOnUnbind) throw new TypeError("Cannot read properties of null (reading 'postMessage')");
      calls.push(ev);
    },
  };
}

test("unbinds every listen event while the embed is attached", () => {
  const w = widget();
  const n = safeUnbindAll(w, { isConnected: true, contentWindow: {} });
  assert.equal(n, SC_LISTEN_EVENTS.length);
  assert.deepEqual(w.calls, [...SC_LISTEN_EVENTS]);
});

test("skips a detached embed (contentWindow null) instead of crashing", () => {
  const w = widget(true);
  assert.doesNotThrow(() => safeUnbindAll(w, { isConnected: false, contentWindow: null }));
  assert.equal(safeUnbindAll(w, { isConnected: true, contentWindow: null }), 0);
});

test("swallows a widget error mid-teardown", () => {
  const w = widget(true);
  assert.doesNotThrow(() => safeUnbindAll(w, { isConnected: true, contentWindow: {} }));
  assert.equal(safeUnbindAll(w, { isConnected: true, contentWindow: {} }), 0);
});

test("no widget yet (SC api still loading) is a no-op", () => {
  assert.equal(safeUnbindAll(null, { isConnected: true, contentWindow: {} }), 0);
  assert.equal(safeUnbindAll(widget(), null), 0);
});
