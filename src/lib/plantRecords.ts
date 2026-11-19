/** Keep only the records that belong to one plant after an owner-scoped list. */
export function rowsForPlant<T extends object>(rows: T[], plantId: string): T[] {
  return rows.filter((row) => (row as { plantId?: string | null }).plantId === plantId);
}
