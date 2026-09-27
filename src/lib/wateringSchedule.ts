/**
 * Build the consolidated "Watering Day" calendar entries from the plants
 * the gardener actually has. Callers must read `inhabitants` — the live
 * garden — not the legacy `plants` collection.
 *
 * Dates that are not YYYY-MM-DD are skipped. Firestore calendar rules
 * reject anything else, and a rejected write must not be allowed to take
 * down the rest of the schedule.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** calendar_events.description must be shorter than 2000 characters. */
const MAX_DESCRIPTION = 1999;

export interface WateringSource {
  name?: string | null;
  nextWatering?: string | null;
}

export interface WateringDay {
  date: string;
  plantNames: string[];
  description: string;
}

export function buildWateringSchedule(plants: WateringSource[]): WateringDay[] {
  const byDate = new Map<string, string[]>();

  for (const plant of plants) {
    const date = plant.nextWatering ?? '';
    if (!DATE_RE.test(date)) continue;
    const name = (plant.name ?? '').trim() || 'Plant';
    const names = byDate.get(date);
    if (names) names.push(name);
    else byDate.set(date, [name]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([date, plantNames]) => {
      const included = plantNames.slice(0, namesThatFit(plantNames));
      if (included.length === 0) return [];
      return [{
        date,
        plantNames: included,
        description: included.map((name) => `• ${name}`).join('\n'),
      }];
    });
}

/** How many names fit in a calendar description (rules: length < 2000). */
function namesThatFit(names: string[]): number {
  let length = 0;
  for (let i = 0; i < names.length; i++) {
    const line = `• ${names[i]}`;
    const next = length === 0 ? line.length : length + 1 + line.length;
    if (next > MAX_DESCRIPTION) return i;
    length = next;
  }
  return names.length;
}
