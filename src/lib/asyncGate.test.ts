import { createAsyncGate } from './asyncGate';

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function main() {
  const gate = createAsyncGate();
  let active = 0;
  let maxActive = 0;

  const nudge = (dx: number, dy: number, seen: { x: number; y: number }, state: { bed: { x: number; y: number }; plant: { x: number; y: number } }) =>
    gate.run(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const target = { x: seen.x + dx, y: seen.y + dy };
      const delta = { x: target.x - state.bed.x, y: target.y - state.bed.y };
      await new Promise((resolve) => setTimeout(resolve, 20));
      state.bed = { x: state.bed.x + delta.x, y: state.bed.y + delta.y };
      state.plant = { x: state.plant.x + delta.x, y: state.plant.y + delta.y };
      active -= 1;
      return true;
    });

  const state = { bed: { x: 2, y: 3 }, plant: { x: 3, y: 4 } };
  const seen = { ...state.bed };
  const [right, down] = await Promise.all([
    nudge(1, 0, seen, state),
    nudge(0, 1, seen, state),
  ]);

  assertEqual(maxActive, 1, 'only one bed move may write at a time');
  assertEqual([right, down].filter((result) => result === true).length, 1, 'the overlapping nudge is dropped');
  assertEqual(state.plant.x - 3, state.bed.x - 2, 'plant keeps its column offset inside the bed');
  assertEqual(state.plant.y - 4, state.bed.y - 3, 'plant keeps its row offset inside the bed');

  const again = await nudge(1, 0, { ...state.bed }, state);
  assertEqual(again, true, 'a nudge after the first write finishes still runs');
}

main();
