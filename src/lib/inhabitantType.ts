/** Types accepted by isValidInhabitant in firestore.rules. */
export const INHABITANT_TYPES = ['Herb', 'Vegetable', 'Flower', 'Annual', 'Perennial'] as const;

export type InhabitantType = (typeof INHABITANT_TYPES)[number];

/**
 * Map a library or form type onto the inhabitant enum.
 * The plant library uses Shrub, Tree, Fruit Tree, Succulent, and others
 * that rules reject, which fails the entire create.
 */
export function normalizeInhabitantType(type: string | undefined | null): InhabitantType {
  if (type && (INHABITANT_TYPES as readonly string[]).includes(type)) return type as InhabitantType;
  const t = (type || '').trim().toLowerCase();
  if (t === 'fruit' || t.includes('fruit')) return 'Vegetable';
  if (t === 'succulent' || t === 'wildflower' || t === 'flower') return 'Flower';
  if (
    t === 'shrub' ||
    t === 'tree' ||
    t === 'shrub/tree' ||
    t === 'vine' ||
    t === 'grass' ||
    t === 'perennial'
  ) {
    return 'Perennial';
  }
  return 'Annual';
}
