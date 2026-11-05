import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AGE_GROUPS, DEFAULT_AGE_GROUP, ageGroup } from "../../module/rules/age.mjs";

describe("ageGroup", () => {
  it("falls back to 21–45 without an age", () => {
    assert.equal(DEFAULT_AGE_GROUP, "adult");
    assert.equal(ageGroup(null), "adult");
    assert.equal(ageGroup(undefined), "adult");
  });

  it("places ages on both edges of every range", () => {
    const cases = [
      [15, "youth"], [20, "youth"],
      [21, "adult"], [45, "adult"],
      [46, "mature"], [65, "mature"],
      [66, "elder"], [120, "elder"]
    ];
    for ( const [age, group] of cases ) assert.equal(ageGroup(age), group, `age ${age}`);
  });

  it("counts ages below the youngest range as youth", () => {
    assert.equal(ageGroup(14), "youth");
    assert.equal(ageGroup(0), "youth");
  });

  it("covers every age from 15 on without gaps", () => {
    for ( let age = 15; age <= 100; age++ ) {
      const group = ageGroup(age);
      const { min, max } = AGE_GROUPS[group];
      assert.ok((age >= min) && ((max === null) || (age <= max)), `age ${age} in ${group}`);
    }
  });

  it("accepts custom ranges and fallback", () => {
    const groups = { young: { min: 0, max: 29 }, old: { min: 30, max: null } };
    assert.equal(ageGroup(29, { groups }), "young");
    assert.equal(ageGroup(30, { groups }), "old");
    assert.equal(ageGroup(null, { groups, fallback: "old" }), "old");
  });
});
