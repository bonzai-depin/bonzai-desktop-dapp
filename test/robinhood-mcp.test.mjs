import test from "node:test";
import assert from "node:assert/strict";
import { classifyRobinhoodTool } from "../src/main/robinhood-mcp.js";

test("classifies brokerage mutations conservatively", () => {
  for (const name of ["place_order", "cancel_order", "replace_order", "update_watchlist"]) {
    assert.equal(classifyRobinhoodTool(name), "mutation");
  }
});

test("keeps reviews separate from reads and execution", () => {
  assert.equal(classifyRobinhoodTool("preview_order"), "review");
  assert.equal(classifyRobinhoodTool("get_positions"), "read");
});
