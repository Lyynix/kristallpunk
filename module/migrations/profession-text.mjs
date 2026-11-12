/**
 * Find the calling and profession in the former free text "Metier / Profession" (#48). Without Foundry dependencies,
 * so it can be tested with node --test.
 *
 * Names are compared word by word, ignoring case and diacritics. Other forms of a word count as well: endings like
 * "-in", "-er", "-e" are left out, and one word may start with the other ("Ärztin" finds "Arzt", "Dieb" finds
 * "Diebin"). Words shorter than four letters are ignored.
 *
 * In this order:
 * 1. professions whose words all occur in the text, e.g. "Soldatin (Kavallerie)" in "Soldat, Kavallerie";
 * 2. callings, among the words not used by 1.;
 * 3. if 1. found none: professions whose first word occurs among the words left, e.g. all three "Soldatin (…)"
 *    in "Soldat".
 * One profession found is taken; several are returned as candidates, to be chosen by hand.
 */

/** Endings left out when comparing words, longest first. */
const ENDINGS = /(innen|in|en|er|e)$/;

/** The shortest word that counts. */
const MIN_LENGTH = 4;

/**
 * The words of a text: lower case, without diacritics, split at everything but letters and digits.
 * @param {string} text
 * @returns {string[]}
 */
function wordsOf(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= MIN_LENGTH);
}

/**
 * Whether two words are forms of the same word.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameWord(a, b) {
  const stem = word => word.replace(ENDINGS, "");
  const [x, y] = [stem(a), stem(b)];
  if ( Math.min(x.length, y.length) < MIN_LENGTH ) return a === b;
  return x.startsWith(y) || y.startsWith(x);
}

/**
 * @param {string} text
 * @param {object} names
 * @param {string[]} names.callings     Names of the callings that can be found.
 * @param {string[]} names.professions  Names of the professions that can be found.
 * @returns {{calling: string|null, profession: string|null, candidates: string[]}}
 */
export function matchProfessionText(text, { callings, professions }) {
  const none = { calling: null, profession: null, candidates: [] };
  if ( typeof text !== "string" ) return none;
  const words = wordsOf(text);
  if ( !words.length ) return none;
  const used = new Set();
  const indexOf = (word, free = true) => words.findIndex((other, i) => (!free || !used.has(i)) && sameWord(word, other));

  // 1. Professions with all their words
  const full = professions.filter(name => {
    const nameWords = wordsOf(name);
    return nameWords.length && nameWords.every(word => indexOf(word, false) >= 0);
  });
  for ( const name of full ) for ( const word of wordsOf(name) ) used.add(indexOf(word, false));

  // 2. Callings among the words left
  let calling = null;
  for ( const name of callings ) {
    const nameWords = wordsOf(name);
    if ( !nameWords.length ) continue;
    const found = nameWords.map(word => indexOf(word));
    if ( found.every(i => i >= 0) ) {
      found.forEach(i => used.add(i));
      calling = name;
      break;
    }
  }

  // 3. Professions by their first word only
  const found = full.length ? full : professions.filter(name => {
    const [first] = wordsOf(name);
    return first && (indexOf(first) >= 0);
  });

  return found.length === 1
    ? { calling, profession: found[0], candidates: [] }
    : { calling, profession: null, candidates: found };
}
