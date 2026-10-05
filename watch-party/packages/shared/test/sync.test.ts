import { describe, expect, it } from 'vitest';
import { ClockSync, computeCorrection, projectTimecode, sanitizeTimestamp } from '../src/sync.js';

describe('projectTimecode', () => {
  it('advances playing state by elapsed time and rate', () => {
    expect(
      projectTimecode({ paused: false, timecode: 100, timestamp: 1_000, playbackRate: 1 }, 3_000),
    ).toBe(102);
    expect(
      projectTimecode({ paused: false, timecode: 100, timestamp: 1_000, playbackRate: 1.5 }, 3_000),
    ).toBe(103);
  });
  it('does not move paused state or go backwards', () => {
    expect(
      projectTimecode({ paused: true, timecode: 50, timestamp: 0, playbackRate: 1 }, 99_999),
    ).toBe(50);
    expect(
      projectTimecode({ paused: false, timecode: 50, timestamp: 5_000, playbackRate: 1 }, 1_000),
    ).toBe(50);
  });
  it('keeps advancing for long-running playback and clamps at 24h', () => {
    // Native-app fallback members rely on this clock for a whole film.
    const twoHours = 2 * 3_600_000;
    expect(
      projectTimecode({ paused: false, timecode: 30, timestamp: 0, playbackRate: 1 }, twoHours),
    ).toBe(30 + 7_200);
    expect(
      projectTimecode(
        { paused: false, timecode: 0, timestamp: 0, playbackRate: 1 },
        30 * 3_600_000,
      ),
    ).toBe(86_400);
  });
});

describe('computeCorrection', () => {
  it('hard seeks beyond 1.0s of drift while playing', () => {
    expect(computeCorrection({ local: 10, target: 11.2, paused: false })).toMatchObject({
      kind: 'seek',
      target: 11.2,
    });
    expect(computeCorrection({ local: 12.01, target: 11, paused: false }).kind).toBe('seek');
  });
  it('speeds up when slightly behind and slows down when slightly ahead', () => {
    expect(computeCorrection({ local: 10, target: 10.5, paused: false })).toMatchObject({
      kind: 'rate',
      rate: 1.05,
    });
    expect(computeCorrection({ local: 10.5, target: 10, paused: false })).toMatchObject({
      kind: 'rate',
      rate: 0.95,
    });
  });
  it('ignores drift inside the deadband', () => {
    expect(computeCorrection({ local: 10, target: 10.1, paused: false })).toEqual({
      kind: 'none',
      rate: 1,
    });
  });
  it('keeps nudging until drift is inside the release band (hysteresis)', () => {
    expect(
      computeCorrection({ local: 10, target: 10.1, paused: false, currentRate: 1.05 }).kind,
    ).toBe('rate');
    expect(
      computeCorrection({ local: 10, target: 10.04, paused: false, currentRate: 1.05 }).kind,
    ).toBe('none');
  });
  it('uses the tighter threshold while paused and never nudges rate', () => {
    expect(computeCorrection({ local: 10, target: 10.3, paused: true }).kind).toBe('seek');
    expect(computeCorrection({ local: 10, target: 10.2, paused: true }).kind).toBe('none');
  });
  it('never nudges players that do not support rate changes', () => {
    expect(
      computeCorrection({ local: 10, target: 10.5, paused: false, supportsRate: false }).kind,
    ).toBe('none');
  });
});

describe('sanitizeTimestamp', () => {
  it('trusts plausible client timestamps and caps future ones', () => {
    expect(sanitizeTimestamp(9_000, 10_000)).toBe(9_000);
    expect(sanitizeTimestamp(10_500, 10_000)).toBe(10_000);
    expect(sanitizeTimestamp(1, 10_000)).toBe(10_000);
  });
});

describe('ClockSync', () => {
  it('estimates offset from symmetric samples', () => {
    const clock = new ClockSync();
    // Server is 5 000ms ahead; 100ms round trip.
    clock.addSample(1_000, 6_050, 1_100);
    expect(clock.offsetMs).toBe(5_000);
    expect(clock.serverNow(2_000)).toBe(7_000);
    expect(clock.toLocal(7_000)).toBe(2_000);
  });
  it('prefers low-RTT samples over jittery ones', () => {
    const clock = new ClockSync(16, 3);
    clock.addSample(0, 5_010, 20); // rtt 20 -> offset 5000
    clock.addSample(100, 5_110, 120); // rtt 20 -> 5000
    clock.addSample(200, 5_212, 220); // rtt 20 -> 5002
    clock.addSample(300, 6_000, 1_300); // rtt 1000, asymmetric -> 5200
    expect(clock.offsetMs).toBe(5_000);
    expect(clock.rttMs).toBe(20);
    expect(clock.isReliable).toBe(true);
  });
  it('ignores impossible samples', () => {
    const clock = new ClockSync();
    clock.addSample(100, 5_000, 50);
    expect(clock.sampleCount).toBe(0);
    expect(clock.offsetMs).toBe(0);
  });
});
