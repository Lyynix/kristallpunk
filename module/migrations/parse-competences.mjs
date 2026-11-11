/**
 * Split the former free text of competences into single competences (#46). Without Foundry dependencies,
 * so it can be tested with node --test.
 */

/** Marks of a list at the start of a line, e.g. "- " or "• ". */
const LIST_MARK = /^[-•*–]\s*/;

/** A trailing parenthesis, e.g. " (Heimlichkeit)". */
const TRAILING_PARENTHESIS = /\s*\(([^()]*)\)\s*$/;

/**
 * One competence per non-empty line. A trailing parenthesis naming a skill sets the skill, as in the table of
 * professions (Erschaffung 1.0, p. 13–15), e.g. "Schleichen (Heimlichkeit)". Another trailing parenthesis before
 * or instead of it is taken as specification, e.g. "Waffenmeister (Säbel)".
 * @param {string} text                    The free text.
 * @param {Record<string, string>} skills  Skill keys by their names in lower case.
 * @returns {{name: string, skill: string|null, specification: string}[]}
 */
export function parseCompetences(text, skills) {
  if ( typeof text !== "string" ) return [];
  const competences = [];
  for ( const line of text.split(/\r?\n/) ) {
    let name = line.trim().replace(LIST_MARK, "").trim();
    if ( !name ) continue;
    let skill = null;
    let specification = "";

    let match = name.match(TRAILING_PARENTHESIS);
    const skillKey = match ? skills[match[1].trim().toLowerCase()] : undefined;
    if ( skillKey ) {
      skill = skillKey;
      name = name.slice(0, match.index);
      match = name.match(TRAILING_PARENTHESIS);
    }
    if ( match && name.slice(0, match.index).trim() ) {
      specification = match[1].trim();
      name = name.slice(0, match.index);
    }
    competences.push({ name: name.trim(), skill, specification });
  }
  return competences;
}
