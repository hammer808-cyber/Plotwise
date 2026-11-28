/** Types accepted by isValidInhabitant in firestore.rules. */
export const INHABITANT_TYPES = ['Herb', 'Vegetable', 'Flower', 'Annual', 'Perennial'] as const;

export type InhabitantType = (typeof INHABITANT_TYPES)[number];

/**
 * Map an edit-form type onto the inhabitant enum.
 * The My Plants editor offers Fruit and Succulent, which rules reject,
 * so the entire plant update (name, notes, and bed assignment) is denied.
 */
export function coerceInhabitantType(type: string | undefined | null): InhabitantType {
  if (type && (INHABITANT_TYPES as readonly string[]).includes(type)) return type as InhabitantType;
  const t = (type || '').trim().toLowerCase();
  if (t === 'fruit' || t.includes('fruit')) return 'Vegetable';
  if (t === 'succulent' || t === 'wildflower') return 'Flower';
  if (t === 'shrub' || t === 'tree' || t === 'shrub/tree' || t === 'vine' || t === 'grass') {
    return 'Perennial';
  }
  return 'Annual';
}
