import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCompetences } from "../../module/migrations/parse-competences.mjs";

/** Skill names as the migration gets them from the localization, plus the name used in the short rules. */
const SKILLS = {
  heimlichkeit: "stealth",
  nahkampf: "meleeCombat",
  orientierung: "orientation",
  resonanz: "prismResonance",
  prismenresonanz: "prismResonance"
};

const parse = text => parseCompetences(text, SKILLS);

describe("parseCompetences (#46)", () => {
  it("takes the skill from a trailing parenthesis", () => {
    assert.deepEqual(parse("Schleichen (Heimlichkeit)"), [{ name: "Schleichen", skill: "stealth", specification: "" }]);
  });

  it("leaves the skill empty without a parenthesis", () => {
    assert.deepEqual(parse("Wegfindung"), [{ name: "Wegfindung", skill: null, specification: "" }]);
  });

  it("takes a parenthesis that names no skill as specification", () => {
    assert.deepEqual(parse("Waffenmeister (Säbel)"), [{ name: "Waffenmeister", skill: null, specification: "Säbel" }]);
  });

  it("takes both a specification and a skill", () => {
    assert.deepEqual(parse("Waffenmeister (Säbel) (Nahkampf)"),
      [{ name: "Waffenmeister", skill: "meleeCombat", specification: "Säbel" }]);
  });

  it("recognizes skills regardless of case", () => {
    assert.deepEqual(parse("schleichen (heimlichkeit)"), [{ name: "schleichen", skill: "stealth", specification: "" }]);
  });

  it("knows the other name of a skill", () => {
    assert.equal(parse("Buchzauberei (Prismenresonanz)")[0].skill, "prismResonance");
  });

  it("removes list marks", () => {
    assert.deepEqual(parse("- Schleichen\n• Wegfindung\n* Navigation").map(entry => entry.name),
      ["Schleichen", "Wegfindung", "Navigation"]);
  });

  it("takes one competence per line, skipping empty lines and surrounding spaces", () => {
    const result = parse("  Schleichen (Heimlichkeit)  \r\n\r\n   \nWegfindung (Orientierung)\n");
    assert.deepEqual(result.map(entry => [entry.name, entry.skill]), [["Schleichen", "stealth"], ["Wegfindung", "orientation"]]);
  });

  it("returns nothing for empty text", () => {
    assert.deepEqual(parse(""), []);
    assert.deepEqual(parse("  \n "), []);
    assert.deepEqual(parse(undefined), []);
  });
});
