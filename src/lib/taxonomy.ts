/**
 * Custom taxonomy documents are validated by isValidCustomTaxonomy:
 * ownership is `discoveredBy` (not ownerUid), and the whole document must
 * stay under Firestore's 1 MiB limit. Camera data URLs blow that limit.
 */

/** Field security rules and the wizard list query both key off. */
export const TAXONOMY_OWNER_FIELD = 'discoveredBy' as const;

/** Leave headroom for the other fields under the 1,048,576-byte document cap. */
export const MAX_TAXONOMY_IMAGE_CHARS = 700_000;

export interface TaxonomyInput {
  name: string;
  type: 'weed' | 'plant';
  threat?: number;
  icon: string;
  discoveredBy: string;
  imageUrl?: string | null;
}

export function buildTaxonomyDoc(input: TaxonomyInput): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    name: input.name,
    type: input.type,
    icon: input.icon,
    [TAXONOMY_OWNER_FIELD]: input.discoveredBy,
    isCustom: true,
  };
  // Firestore rejects undefined. Plants have no threat score — omit the field.
  if (input.type === 'weed' && typeof input.threat === 'number') {
    doc.threat = input.threat;
  }
  const image = input.imageUrl;
  if (
    typeof image === 'string' &&
    (image.startsWith('data:image/') || image.startsWith('https://') || image.startsWith('http://')) &&
    image.length <= MAX_TAXONOMY_IMAGE_CHARS
  ) {
    doc.imageUrl = image;
  }
  return doc;
}
