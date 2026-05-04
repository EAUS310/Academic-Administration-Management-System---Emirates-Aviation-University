'use strict';

/**
 * Replaces actual CR/LF characters with a slash and collapses extra spaces.
 * Handles null/undefined inputs safely.
 */
function clean(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 13 || c === 10) {
      if (out.length && out[out.length - 1] !== '/') out += '/';
    } else {
      out += s[i];
    }
  }
  return out.replace(/  +/g, ' ').trim();
}

/**
 * Finds the first column index in a row whose cleaned, uppercased value
 * matches any entry in the candidates array.
 */
function colOf(row, candidates) {
  const targets = candidates.map(c => c.toUpperCase().trim());
  for (let j = 0; j < row.length; j++) {
    const v = clean(String(row[j] ?? '')).toUpperCase();
    if (targets.includes(v)) return j;
  }
  return -1;
}

module.exports = { clean, colOf };
