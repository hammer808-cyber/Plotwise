import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { Inhabitant } from '../types';
import type { BedLike } from '../components/BedEditModal';

export interface DuplicatableBed extends BedLike {
  plotId: string | null;
  type?: string;
  ownerUid: string;
}

export interface DuplicateResult {
  id: string;
  name: string;
  plantsCopied: number;
}

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function uniqueCopyName(base: string, taken: Set<string>): string {
  let candidate = `${base} copy`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base} copy ${n}`;
    n++;
  }
  return candidate;
}

/**
 * Duplicates a bed into the first free non-overlapping spot in the plot
 * (top-left scan, same as the bed quiz), along with the plants actually
 * assigned to it — shifted by the same offset so the layout is preserved.
 * Returns null when the plot has no room for the copy.
 */
export async function duplicateBed(opts: {
  bed: DuplicatableBed;
  plants: Inhabitant[];
  siblingBeds: BedLike[];
  plotCols: number;
  plotRows: number;
  /** When true, the copy stays out of any plot (no placement scan). */
  standalone?: boolean;
}): Promise<DuplicateResult | null> {
  const { bed, plants, siblingBeds, plotCols, plotRows, standalone } = opts;
  const w = bed.size.w;
  const h = bed.size.h;

  let spot: { x: number; y: number } | null = null;
  if (standalone || !bed.plotId) {
    spot = { x: 0, y: 0 };
  } else {
    for (let y = 0; y <= plotRows - h && !spot; y++) {
      for (let x = 0; x <= plotCols - w && !spot; x++) {
        const hit = siblingBeds.some(
          (b) =>
            b.id !== bed.id &&
            rectsOverlap(x, y, w, h, b.gridPosition.x, b.gridPosition.y, b.size.w, b.size.h)
        );
        if (!hit) spot = { x, y };
      }
    }
  }
  if (!spot) return null;

  const taken = new Set(siblingBeds.map((b) => b.name));
  const name = uniqueCopyName(bed.name || 'Bed', taken);

  const bedRef = await addDoc(collection(db, 'planters'), {
    ownerUid: bed.ownerUid,
    plotId: bed.plotId || null,
    name,
    type: bed.type || 'Raised Bed',
    gridPosition: spot,
    size: { w, h },
    color: bed.color || '#4CAF50',
    createdAt: serverTimestamp(),
  });

  // Copy the bed's own plants, preserving their relative layout.
  const dx = spot.x - bed.gridPosition.x;
  const dy = spot.y - bed.gridPosition.y;
  const bedPlants = plants.filter((p) => p.planterId === bed.id && p.gridPosition);
  let copied = 0;
  for (const p of bedPlants) {
    const gx = (p.gridPosition?.x ?? 0) + dx;
    const gy = (p.gridPosition?.y ?? 0) + dy;
    // Skip anything that wouldn't land inside the copy (stale coordinates).
    if (gx < spot.x || gy < spot.y || gx >= spot.x + w || gy >= spot.y + h) continue;
    const validTypes = ['Herb', 'Vegetable', 'Flower', 'Annual', 'Perennial'];
    const docData: Record<string, unknown> = {
      ownerUid: bed.ownerUid,
      plotId: bed.plotId || null,
      planterId: bedRef.id,
      name: p.name || 'Plant',
      type: validTypes.includes(p.type || '') ? p.type : 'Vegetable',
      status: p.status || 'Pending',
      gridPosition: { x: gx, y: gy },
      createdAt: serverTimestamp(),
    };
    // Optional fields only when defined — Firestore rejects undefined values.
    if (p.latinName) docData.latinName = p.latinName;
    if (p.image) docData.image = p.image;
    if (p.waterFreq) docData.waterFreq = p.waterFreq;
    if (p.sunExposure) docData.sunExposure = p.sunExposure;
    await addDoc(collection(db, 'inhabitants'), docData);
    copied++;
  }

  return { id: bedRef.id, name, plantsCopied: copied };
}
