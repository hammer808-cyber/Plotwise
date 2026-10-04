/** Types accepted by isValidInhabitant in firestore.rules. */
export const INHABITANT_TYPES = ['Herb', 'Vegetable', 'Flower', 'Annual', 'Perennial'] as const;

export type InhabitantType = (typeof INHABITANT_TYPES)[number];

/**
 * Map a UI / library type onto the inhabitant enum.
 * Fruit and Succulent are offered in the inventory form but rejected by rules,
 * which fails the entire plant save.
 */
export function normalizeInhabitantType(type: string | undefined | null): InhabitantType {
  if (type && (INHABITANT_TYPES as readonly string[]).includes(type)) return type as InhabitantType;
  if (type === 'Fruit' || type === 'Fruit Tree') return 'Vegetable';
  if (type === 'Succulent' || type === 'Wildflower') return 'Flower';
  return 'Annual';
}

export interface PlantAssignmentInput {
  plotId?: string | null;
  planterId?: string | null;
}

export interface PlantAssignmentPatch {
  plotId?: string | null;
  planterId?: string | null;
  gridPosition?: { x: number; y: number };
}

/**
 * The inventory plot/bed selects use "" for "Unassigned" and "No bed".
 * Rules allow that empty string, but the planting rail queries `plotId == null`,
 * so "" matches neither a plot nor the rail and the plant cannot be placed again.
 * Clearing the plot or the bed also drops the old cell; otherwise the plant
 * stays planted at those coordinates.
 * Absent fields are omitted — Firestore rejects an undefined value.
 */
export function plantAssignmentPatch(input: PlantAssignmentInput): PlantAssignmentPatch {
  const plotCleared = input.plotId === '';
  const bedCleared = input.planterId === '';
  const patch: PlantAssignmentPatch = {};

  if (input.plotId !== undefined) {
    patch.plotId = plotCleared ? null : input.plotId;
  }

  if (plotCleared || bedCleared) {
    patch.planterId = null;
    patch.gridPosition = { x: 0, y: 0 };
  } else if (input.planterId !== undefined) {
    patch.planterId = input.planterId;
  }

  return patch;
}
