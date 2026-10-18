// The simulated fire front: it is drawn from places and times the research documents, sized to the
// acreage the reports give, never shrinks, stays on land, and plays the same every time. Run with `npm test`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { seedAddresses } from '../src/lib/addresses.ts';
import { PERIMETER } from '../src/lib/zones.ts';
import { createEngine } from '../src/lib/scenario/engine.ts';
import { fireAt, fireReaches, SEEDS, type FireRing } from '../src/lib/scenario/fire.ts';
import { SIM_END_MIN, at } from '../src/lib/scenario/palisades.ts';

const M_PER_DEG_LAT = 110_950;
const M_PER_DEG_LNG = 111_320 * Math.cos((34.06 * Math.PI) / 180);

const burning = (ring: FireRing, lat: number, lng: number): boolean => {
  let inside = false;
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a, a += 1) {
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    if (ay > lat !== by > lat && lng < ax + ((lat - ay) / (by - ay)) * (bx - ax)) inside = !inside;
  }
  return inside;
};
const burningAt = (min: number, lat: number, lng: number) => fireAt(min).rings.some((r) => burning(r, lat, lng));

const acres = (min: number): number => {
  let m2 = 0;
  for (const ring of fireAt(min).rings) {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      sum += ring[i][0] * M_PER_DEG_LNG * (ring[i + 1][1] * M_PER_DEG_LAT) - ring[i + 1][0] * M_PER_DEG_LNG * (ring[i][1] * M_PER_DEG_LAT);
    }
    m2 += Math.abs(sum) / 2;
  }
  return m2 / 4046.86;
};

describe('the simulated fire', () => {
  it('starts at the first report and not before', () => {
    assert.equal(fireAt(at('10:22')).rings.length, 0);
    assert.equal(fireAt(0).rings.length, 0, 'nothing at the start of the scenario');
    const first = fireAt(at('10:23'));
    assert.equal(first.rings.length, 1);
    assert.ok(acres(at('10:23')) < 5, 'a spark, not a fire');
  });

  it('is at every documented place by the documented minute', () => {
    for (const s of SEEDS) {
      assert.ok(s.what && s.source, `${s.id} says what it is and where it is from`);
      assert.ok(s.t >= 0 && s.t <= SIM_END_MIN, `${s.id} is inside the scenario's day`);
      assert.ok(burningAt(s.t + 1, s.lat, s.lng), `${s.id} is burning one minute after its report`);
      assert.ok(fireReaches(s.lat, s.lng, s.t), `${s.id} is reached at its report`);
    }
  });

  it('does not reach places the reports have it reaching later', () => {
    // Charmel Ln: "advancing towards" at 10:43, so not yet there at 10:30.
    assert.equal(fireReaches(34.0593, -118.5504, at('10:30')), false);
    assert.equal(fireReaches(34.0593, -118.5504, at('11:10')), true);
    // Enchanted Way catches by spot fire at 11:24, ahead of the front, not before.
    assert.equal(fireReaches(34.0514, -118.549, at('11:10')), false);
    // The Highlands burn in the evening, as the heel moves north.
    assert.equal(fireReaches(34.078, -118.5667, at('18:00')), false);
    assert.equal(fireReaches(34.078, -118.5667, at('22:00')), true);
  });

  it('is sized like the reports: about 100 acres at 10:48, 200 at 11:28, past 700 by 14:10, near 2,900 that evening', () => {
    const within = (min: number, lo: number, hi: number) => {
      const a = acres(min);
      assert.ok(a >= lo && a <= hi, `${a.toFixed(0)} acres is outside ${lo}-${hi}`);
    };
    within(at('10:48'), 60, 250);
    within(at('11:28'), 120, 450);
    within(at('14:10'), 700, 1800);
    within(SIM_END_MIN, 1500, 4000);
  });

  it('never shrinks, and keeps moving through the day', () => {
    let before = 0;
    for (let min = 0; min <= SIM_END_MIN; min += 10) {
      const a = acres(min);
      assert.ok(a >= before * 0.98, `shrank at minute ${min}: ${before.toFixed(0)} to ${a.toFixed(0)} acres`);
      before = a;
    }
    assert.ok(acres(at('18:00')) > acres(at('14:10')), 'still spreading in the afternoon');
    assert.ok(acres(at('24:00')) > acres(at('18:00')), 'and into the night');
  });

  it('stays on land: nothing runs out over the water past the shoreline', () => {
    assert.equal(fireReaches(34.025, -118.55, SIM_END_MIN), false, 'open ocean off the coast');
    const south = Math.min(...PERIMETER.map((p) => p[0]));
    for (const ring of fireAt(SIM_END_MIN).rings) {
      for (const [, lat] of ring) assert.ok(lat > south - 0.0006, 'no vertex is more than about 60 m past the southernmost shore point');
    }
  });

  it('is closed, finite outlines, and the same every time', () => {
    for (const min of [at('10:30'), at('12:00'), at('20:00')]) {
      for (const ring of fireAt(min).rings) {
        assert.ok(ring.length >= 4);
        assert.deepEqual(ring[0], ring[ring.length - 1], 'closed');
        for (const [lng, lat] of ring) assert.ok(Number.isFinite(lng) && Number.isFinite(lat));
      }
    }
    const once = JSON.stringify(fireAt(at('13:00')));
    fireAt(at('15:00'));
    assert.equal(JSON.stringify(fireAt(at('13:00'))), once);
  });

  it('comes with the scenario snapshot, and touches no household', () => {
    const houses = seedAddresses();
    const engine = createEngine(houses);
    assert.equal(engine.at(0).fire.rings.length, 0);
    assert.ok(engine.at(at('12:00')).fire.rings.length > 0);
    const before = JSON.stringify(engine.at(at('12:00')).addresses);
    fireAt(SIM_END_MIN);
    assert.equal(JSON.stringify(createEngine(houses).at(at('12:00')).addresses), before, 'households are the engine’s alone');
  });
});
