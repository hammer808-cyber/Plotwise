import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
const inventory = readFileSync(join(root, 'src/components/Inventory.tsx'), 'utf8');

const match = rules.match(/match \/equipment\/\{equipmentId\} \{[\s\S]*?\n    \}/);
assert.ok(match, 'equipment collection must have its own rules match');
assert.match(match[0], /allow read: if isDocOwner\(\) \|\| isAdmin\(\)/);
assert.match(match[0], /allow create: if isAuthenticated\(\) && isValidEquipment/);
assert.match(match[0], /allow delete: if isDocOwner\(\) \|\| isAdmin\(\)/);
assert.match(match[0], /uidNotModified\(\)/);

function optionValues(source: string, marker: string): string[] {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${marker}`);
  const slice = source.slice(start, start + 800);
  return [...slice.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]);
}

const categories = optionValues(inventory, 'value={newEquipmentData.category}');
const conditions = optionValues(inventory, 'value={newEquipmentData.condition}');
assert.deepEqual(categories, ['Tools', 'Irrigation', 'Soil', 'Pest Control', 'Safety']);
assert.deepEqual(conditions, ['New', 'Good', 'Fair', 'Poor']);

for (const value of [...categories, ...conditions]) {
  assert.ok(rules.includes(`'${value}'`), `rules reject equipment value ${value}`);
}

assert.match(inventory, /collection\(db, 'equipment'\)/);
assert.match(inventory, /ownerUid: user\.uid/);
assert.match(inventory, /createdAt: serverTimestamp\(\)/);
assert.match(match[0], /isDocOwner\(\)/);
assert.doesNotMatch(match[0], /allow read: if isAuthenticated\(\)/);

console.log('equipmentRules.test.ts ok');
