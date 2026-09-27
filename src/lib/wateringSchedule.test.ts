import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildWateringSchedule } from './wateringSchedule.ts';

describe('buildWateringSchedule', () => {
  it('groups the live garden by nextWatering date', () => {
    const days = buildWateringSchedule([
      { name: 'Tomato', nextWatering: '2026-09-30' },
      { name: 'Basil', nextWatering: '2026-09-28' },
      { name: 'Mint', nextWatering: '2026-09-28' },
    ]);

    assert.deepEqual(days, [
      {
        date: '2026-09-28',
        plantNames: ['Basil', 'Mint'],
        description: '• Basil\n• Mint',
      },
      {
        date: '2026-09-30',
        plantNames: ['Tomato'],
        description: '• Tomato',
      },
    ]);
  });

  it('drops blank names, missing dates, and dates the calendar rules would reject', () => {
    const days = buildWateringSchedule([
      { name: '   ', nextWatering: '2026-09-28' },
      { name: 'Tomato', nextWatering: '2026-09-28T00:00:00.000Z' },
      { name: 'Basil', nextWatering: 'soon' },
      { name: 'Mint' },
      { name: 'Rose', nextWatering: '' },
    ]);

    assert.deepEqual(days, [
      {
        date: '2026-09-28',
        plantNames: ['Plant'],
        description: '• Plant',
      },
    ]);
  });

  it('returns an empty schedule when nothing is due, so callers can avoid wiping existing events for no reason', () => {
    assert.deepEqual(
      buildWateringSchedule([{ name: 'Tomato' }, { name: 'Basil', nextWatering: null }]),
      []
    );
  });

  it('keeps a day description inside the calendar rules limit', () => {
    const plants = Array.from({ length: 400 }, (_, i) => ({
      name: `Plant ${i} `.repeat(8).trim(),
      nextWatering: '2026-09-28',
    }));
    const [day] = buildWateringSchedule(plants);
    assert.ok(day);
    assert.ok(day.description.length < 2000);
    assert.ok(day.description.length > 0);
    assert.ok(day.plantNames.length < plants.length);
  });
});
