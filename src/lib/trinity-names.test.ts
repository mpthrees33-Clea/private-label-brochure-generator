import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseTrinityName } from "./trinity-names";

describe("private-label names", () => {
  it("never keeps a placeholder and never repeats a saved name", () => {
    assert.equal(chooseTrinityName("rename-me", ["kendall"]), "ashland");
    assert.equal(chooseTrinityName("", ["ashland"]), "auburn");
    assert.equal(chooseTrinityName("calvert", ["calvert", "caldwell"]), "ashland");
    assert.equal(chooseTrinityName("kendall", []), "ashland");
    assert.equal(chooseTrinityName("keene", ["ashland"]), "keene");
    assert.equal(chooseTrinityName("halvern", ["halden"], { separate: true }), "ashland");
    assert.equal(chooseTrinityName("halsted", ["halden"], { separate: true }), "ashland");
    assert.equal(chooseTrinityName("keene", ["kendall"], { separate: true }), "keene");
  });
});