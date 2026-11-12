import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchProfessionText } from "../../module/migrations/profession-text.mjs";

/** Names as in the compendiums (Erschaffung 1.0, p. 12–15). */
const CALLINGS = ["Arkanist", "Galvanist", "Forscher", "Beobachter", "Streiter", "Gesellschafter"];
const PROFESSIONS = [
  "Arzt", "Kristallprospektorin", "Trübnis-Jägerin", "Spion", "Diebin", "Salonlöwe", "14ième", "Geistlicher",
  "Galvanistischer Kunstschmied", "Soldatin (Infanterie)", "Soldatin (Kavallerie)", "Soldatin (Artillerie)", "Offizier"
];

const match = text => matchProfessionText(text, { callings: CALLINGS, professions: PROFESSIONS });

describe("matchProfessionText (#48)", () => {
  it("finds a profession by its name", () => {
    assert.deepEqual(match("Arzt"), { calling: null, profession: "Arzt", candidates: [] });
  });

  it("finds calling and profession in one text, in any order and with separators", () => {
    assert.deepEqual(match("Forscher / Arzt"), { calling: "Forscher", profession: "Arzt", candidates: [] });
    assert.deepEqual(match("Spion, Beobachter"), { calling: "Beobachter", profession: "Spion", candidates: [] });
  });

  it("finds only a calling", () => {
    assert.deepEqual(match("Streiter"), { calling: "Streiter", profession: null, candidates: [] });
  });

  it("ignores case and diacritics", () => {
    assert.deepEqual(match("TRÜBNIS-JÄGERIN").profession, "Trübnis-Jägerin");
    assert.deepEqual(match("14ieme").profession, "14ième");
  });

  it("finds other forms of a name", () => {
    assert.equal(match("Ärztin").profession, "Arzt");
    assert.equal(match("Spionin").profession, "Spion");
    assert.equal(match("Dieb").profession, "Diebin");
    assert.equal(match("Salonlöwin").profession, "Salonlöwe");
    assert.equal(match("Geistliche").profession, "Geistlicher");
    assert.equal(match("Kristallprospektor").profession, "Kristallprospektorin");
    assert.equal(match("Offizierin").profession, "Offizier");
    assert.equal(match("Arkanistin").calling, "Arkanist");
  });

  it("needs all words of a name of several words", () => {
    assert.equal(match("Galvanistischer Kunstschmied").profession, "Galvanistischer Kunstschmied");
    assert.equal(match("Kunstschmied").profession, null);
  });

  it("takes a profession with its specification when the text names it", () => {
    assert.equal(match("Soldat, Kavallerie").profession, "Soldatin (Kavallerie)");
  });

  it("lists the candidates when a text fits several professions", () => {
    assert.deepEqual(match("Soldat"), {
      calling: null, profession: null,
      candidates: ["Soldatin (Infanterie)", "Soldatin (Kavallerie)", "Soldatin (Artillerie)"]
    });
  });

  it("does not take a calling as part of a profession's name", () => {
    // "Galvanist" would match the first word of "Galvanistischer Kunstschmied", which needs both words
    assert.deepEqual(match("Galvanist"), { calling: "Galvanist", profession: null, candidates: [] });
  });

  it("does not match short words", () => {
    assert.deepEqual(match("der Arzt"), { calling: null, profession: "Arzt", candidates: [] });
    assert.deepEqual(match("ein"), { calling: null, profession: null, candidates: [] });
  });

  it("finds nothing in an unknown text", () => {
    assert.deepEqual(match("Kräuterweib"), { calling: null, profession: null, candidates: [] });
  });

  it("finds nothing in an empty text", () => {
    assert.deepEqual(match(""), { calling: null, profession: null, candidates: [] });
    assert.deepEqual(match(undefined), { calling: null, profession: null, candidates: [] });
  });
});
