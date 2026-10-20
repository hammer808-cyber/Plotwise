/**
 * Guards against a Firestore rules footgun: every matching `allow` is OR'd,
 * including a second `match` on the same path. A looser block that keys only
 * off the existing `ownerUid` lets that owner rewrite `ownerUid` and drop the
 * document into someone else's queries.
 */

export interface RuleProblem {
  collection: string;
  detail: string;
}

function matchBodies(rules: string, collection: string): string[] {
  const needle = `match /${collection}/`;
  const bodies: string[] = [];
  let from = 0;
  while (from < rules.length) {
    const start = rules.indexOf(needle, from);
    if (start < 0) break;
    const open = rules.indexOf('{', start);
    if (open < 0) break;
    let depth = 0;
    let i = open;
    for (; i < rules.length; i++) {
      if (rules[i] === '{') depth++;
      else if (rules[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    bodies.push(rules.slice(open + 1, i));
    from = i + 1;
  }
  return bodies;
}

function writeAllows(body: string): string[] {
  return body
    .split('allow ')
    .slice(1)
    .map((statement) => statement.slice(0, statement.indexOf(';') === -1 ? statement.length : statement.indexOf(';')))
    .filter((statement) => /^(read\s*,\s*write|write|update)\b/.test(statement.trim()));
}

/** Collections whose owner must stay put, and how many match blocks are allowed. */
const OWNED_COLLECTIONS: { name: string; maxMatches: number }[] = [
  { name: 'tasks', maxMatches: 1 },
  { name: 'logs', maxMatches: 2 }, // plants/{id}/logs plus the top-level logs collection
];

export function ownerReassignmentHoles(rules: string): RuleProblem[] {
  const problems: RuleProblem[] = [];
  for (const { name, maxMatches } of OWNED_COLLECTIONS) {
    const bodies = matchBodies(rules, name);
    if (bodies.length > maxMatches) {
      problems.push({
        collection: name,
        detail: `expected at most ${maxMatches} match block(s), found ${bodies.length}`,
      });
    }
    if (name === 'tasks' && bodies.length === 0) {
      problems.push({ collection: name, detail: 'tasks match is missing' });
    }
    for (const body of bodies) {
      for (const allow of writeAllows(body)) {
        if (!allow.includes('uidNotModified')) {
          problems.push({
            collection: name,
            detail: `write allow can change ownerUid: ${allow.replace(/\s+/g, ' ').trim()}`,
          });
        }
      }
    }
  }
  return problems;
}
