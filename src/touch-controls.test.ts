import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Cesium mock ───────────────────────────────────────────────────────────────
// Hoisted above all imports. touch-controls.ts calls Cesium.Math.toRadians at
// module level (to compute MAX_PITCH), so Math must be present immediately.
vi.mock('cesium', () => ({
  Math: {
    toRadians: (deg: number) => (deg * Math.PI) / 180,
    clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
  },
  // Cartesian2 is constructed in touchstart for the ellipsoid raycast
  Cartesian2: vi.fn().mockImplementation(function (this: any, x: number, y: number) {
    this.x = x;
    this.y = y;
  }),
  // distance() is used to compute the range (camera → pivot) for lookAt calls
  Cartesian3: {
    distance: vi.fn().mockReturnValue(1000),
  },
  // HeadingPitchRange instances capture their args so tests can inspect them
  HeadingPitchRange: vi.fn().mockImplementation(function (
    this: any,
    heading: number,
    pitch: number,
    range: number,
  ) {
    this.heading = heading;
    this.pitch = pitch;
    this.range = range;
  }),
  // IDENTITY is passed verbatim to camera.lookAtTransform on exit — use a
  // sentinel string so tests can assert the right value without importing Cesium
  Matrix4: { IDENTITY: '__IDENTITY__' },
}));

import * as Cesium from 'cesium'; // resolves to the vi.mock above
import { initTouchControls } from './touch-controls';

// ── helpers ───────────────────────────────────────────────────────────────────

// Minimal Touch-like object — touch-controls.ts only reads clientX / clientY.
function t(clientX: number, clientY: number): Touch {
  return { clientX, clientY } as unknown as Touch;
}

// Fake canvas: Node's EventTarget + the three DOM properties the control reads.
function makeCanvas() {
  const canvas = new EventTarget() as EventTarget & {
    width: number;
    height: number;
    getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  };
  canvas.width  = 1000;
  canvas.height = 500;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 });
  return canvas;
}

// Dispatch a touch event carrying the given touches array.
// We attach `touches` directly to the Event object — touch-controls.ts only
// reads e.touches[0], e.touches[1], and e.touches.length.
function fire(canvas: EventTarget, type: string, touches: Touch[]) {
  const event = Object.assign(new Event(type), { touches });
  canvas.dispatchEvent(event);
}

// Minimal Cesium Viewer mock.
// Camera starts at heading=0, pitch=−45° (a typical mid-tilt view).
// pickEllipsoid returns a fake Cartesian3 by default (touch is on-globe).
function makeViewer(canvas: ReturnType<typeof makeCanvas>) {
  const fakeTarget = { x: 1, y: 0, z: 0 };
  const camera = {
    heading:    0,
    pitch:      -Math.PI / 4,
    position:   { x: 0, y: 0, z: 1_000_000 },
    positionWC: { x: 0, y: 0, z: 1_000_000 },
    lookAt:             vi.fn(),
    lookAtTransform:    vi.fn(),
    pickEllipsoid:      vi.fn().mockReturnValue(fakeTarget),
  };
  const ssc = { enableInputs: true };
  const viewer = {
    scene: { canvas, screenSpaceCameraController: ssc },
    camera,
  };
  return { viewer: viewer as unknown as Cesium.Viewer, camera, ssc, fakeTarget };
}

// ── fixtures ──────────────────────────────────────────────────────────────────

let canvas: ReturnType<typeof makeCanvas>;

beforeEach(() => {
  vi.clearAllMocks();
  // startInertia calls requestAnimationFrame; stub it so tests don't throw in
  // the node environment and inertia never actually runs (we don't call tick).
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  vi.stubGlobal('cancelAnimationFrame',  vi.fn());
  canvas = makeCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Geometry note (read before modifying the tests) ───────────────────────────
//
// geo(a, b) computes:
//   angle = atan2(b.clientY − a.clientY, b.clientX − a.clientX)
//   midY  = (a.clientY + b.clientY) / 2
//   dist  = hypot(b.clientX − a.clientX, b.clientY − a.clientY)
//
// The state machine accumulates abs deltas per move:
//   acc.angle += |dAngle| * (180/π) * 10   ← scales radians → ~px-comparable units
//   acc.midY  += |dMidY|
//   acc.dist  += |dDist|
// Classification fires once max(acc.*) ≥ 15 (CLASSIFY_THRESHOLD).
//
// The classification touchmove transitions the state but does NOT apply the
// gesture — it returns early. Camera effects land on the NEXT touchmove.
// So every gesture test below uses a 3-event sequence:
//   touchstart → touchmove (classify) → touchmove (apply)

// ── SSC management ────────────────────────────────────────────────────────────

describe('SSC management', () => {
  it('disables SSC immediately on two-finger touchstart', () => {
    const { viewer, ssc } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);

    expect(ssc.enableInputs).toBe(false);
  });

  it('does NOT disable SSC on a single-finger touchstart', () => {
    const { viewer, ssc } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(50, 100)]);

    expect(ssc.enableInputs).toBe(true);
  });

  it('does NOT disable SSC on a three-finger touchstart', () => {
    const { viewer, ssc } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0), t(50, 100)]);

    expect(ssc.enableInputs).toBe(true);
  });

  it('re-enables SSC on touchend', () => {
    const { viewer, ssc } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    expect(ssc.enableInputs).toBe(false);

    fire(canvas, 'touchend', []);
    expect(ssc.enableInputs).toBe(true);
  });

  it('re-enables SSC on touchcancel', () => {
    const { viewer, ssc } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchcancel', []);

    expect(ssc.enableInputs).toBe(true);
  });

  it('re-enables SSC immediately when gesture classifies as zoom (hand-off to Cesium)', () => {
    const { viewer, ssc } = makeViewer(canvas);
    initTouchControls(viewer);

    // Pure spread: fingers move apart symmetrically, no angle or midY change.
    //   Start: A=(0,0) B=(100,0)  → angle=0, midY=0,  dist=100
    //   Move:  A=(−15,0) B=(115,0) → angle=0, midY=0,  dist=130; dDist=30 > 15 → zoom
    fire(canvas, 'touchstart', [t(0, 0),   t(100, 0)]);
    fire(canvas, 'touchmove',  [t(-15, 0), t(115, 0)]);

    expect(ssc.enableInputs).toBe(true);
  });
});

// ── exitLookAt on gesture end ─────────────────────────────────────────────────

describe('exitLookAt (camera.lookAtTransform) on gesture end', () => {
  // exitLookAt releases the lookAt frame that rotate/tilt put the camera in.
  // It must be called on every touchend and touchcancel, regardless of gesture.

  it('calls camera.lookAtTransform(IDENTITY) on touchend after two-finger touch', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchend',   []);

    expect(camera.lookAtTransform).toHaveBeenCalledWith('__IDENTITY__');
  });

  it('calls camera.lookAtTransform(IDENTITY) on touchcancel', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart',  [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchcancel', []);

    expect(camera.lookAtTransform).toHaveBeenCalledWith('__IDENTITY__');
  });
});

// ── Rotate gesture ────────────────────────────────────────────────────────────

describe('rotate gesture', () => {
  // Rotation scenario: fingers rotate ~10° around their midpoint.
  //   Start:   A=(0,0) B=(100,0)  → angle = atan2(0, 100)  = 0 rad
  //   Classify: A=(0,0) B=(98,17) → angle = atan2(17, 98) ≈ 0.172 rad
  //     dAngle ≈ 0.172, |dAngle| < ANGLE_JUMP_LIMIT (0.3) → accepted
  //     acc.angle = 0.172*(180/π)*10 ≈ 98.6 > 15 → LOCKED as 'rotate'
  //   Apply:   A=(0,0) B=(96,34)  → angle = atan2(34, 96) ≈ 0.341 rad
  //     dAngle ≈ 0.169, applied as dAngle*0.5 ≈ 0.085

  it('calls camera.lookAt after rotation gesture is applied', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(98,  17)]); // classify
    fire(canvas, 'touchmove',  [t(0, 0), t(96,  34)]); // apply

    expect(camera.lookAt).toHaveBeenCalled();
  });

  it('applies heading delta of dAngle * 0.5 (damping factor)', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.heading = 0;

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(98,  17)]); // classify; locked.prev = (0,0),(98,17)
    fire(canvas, 'touchmove',  [t(0, 0), t(96,  34)]); // apply

    // dAngle = atan2(34,96) − atan2(17,98)
    const classifyAngle = Math.atan2(17, 98);
    const applyAngle    = Math.atan2(34, 96);
    const expectedHeading = camera.heading - (applyAngle - classifyAngle) * 0.5;

    const hpr = (camera.lookAt.mock.calls[0] as any[])[1];
    expect(hpr.heading).toBeCloseTo(expectedHeading, 5);
  });

  it('uses ellipsoid hit point as pivot when touch is on-globe', () => {
    const { viewer, camera, fakeTarget } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(98,  17)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(96,  34)]);

    // First arg to lookAt is the pivot
    expect(camera.lookAt.mock.calls[0][0]).toBe(fakeTarget);
  });

  it('falls back to camera.positionWC as pivot when touch is off-globe', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.pickEllipsoid = vi.fn().mockReturnValue(null); // off-globe

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(98,  17)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(96,  34)]);

    expect(camera.lookAt.mock.calls[0][0]).toBe(camera.positionWC);
  });

  it('pitch does not change during rotation (heading-only gesture)', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.pitch = -Math.PI / 4;

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(98,  17)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(96,  34)]);

    const hpr = (camera.lookAt.mock.calls[0] as any[])[1];
    expect(hpr.pitch).toBeCloseTo(camera.pitch, 5);
  });

  it('does NOT call camera.lookAt on the classification frame itself', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(98,  17)]); // classify only

    expect(camera.lookAt).not.toHaveBeenCalled();
  });
});

// ── Tilt gesture ──────────────────────────────────────────────────────────────

describe('tilt gesture', () => {
  // Tilt scenario: both fingers translate vertically together.
  //   Start:    A=(0,0)   B=(100,0)   → angle=0, midY=0, dist=100
  //   Classify: A=(0,−20) B=(100,−20) → angle=0, midY=−20, dist=100
  //     dMidY = −20, acc.midY = 20 > 15 → max reached
  //     Not rotate (acc.angle=0 < acc.midY=20), tilt? acc.midY(20) > acc.dist(0)*2 → TILT
  //   Apply:    A=(0,−40) B=(100,−40) → dMidY = −20

  it('calls camera.lookAt after tilt gesture is applied', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0),    t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, -20),  t(100, -20)]); // classify
    fire(canvas, 'touchmove',  [t(0, -40),  t(100, -40)]); // apply

    expect(camera.lookAt).toHaveBeenCalled();
  });

  it('heading does not change during tilt (pitch-only gesture)', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.heading = 1.23;

    fire(canvas, 'touchstart', [t(0, 0),   t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, -20), t(100, -20)]);
    fire(canvas, 'touchmove',  [t(0, -40), t(100, -40)]);

    const hpr = (camera.lookAt.mock.calls[0] as any[])[1];
    expect(hpr.heading).toBe(camera.heading);
  });

  it('fingers moving UP (dMidY < 0) tilts camera toward horizon (pitch increases)', () => {
    // dMidY = −20 → newPitch = clamp(pitch − (−20)*0.003, ...) = clamp(pitch + 0.06, ...)
    // pitch increases (less negative) → toward horizon
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.pitch = -Math.PI / 4;

    fire(canvas, 'touchstart', [t(0, 0),   t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, -20), t(100, -20)]);
    fire(canvas, 'touchmove',  [t(0, -40), t(100, -40)]);

    const hpr = (camera.lookAt.mock.calls[0] as any[])[1];
    expect(hpr.pitch).toBeGreaterThan(camera.pitch);
  });

  it('fingers moving DOWN (dMidY > 0) tilts camera toward nadir (pitch decreases)', () => {
    // dMidY = +20 → newPitch = clamp(pitch − 20*0.003, ...) = clamp(pitch − 0.06, ...)
    // pitch decreases (more negative) → toward nadir
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.pitch = -Math.PI / 4;

    fire(canvas, 'touchstart', [t(0, 0),  t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 20), t(100, 20)]);
    fire(canvas, 'touchmove',  [t(0, 40), t(100, 40)]);

    const hpr = (camera.lookAt.mock.calls[0] as any[])[1];
    expect(hpr.pitch).toBeLessThan(camera.pitch);
  });

  it('pitch is clamped at MAX_PITCH (≈ −15°) — cannot tilt past near-horizon limit', () => {
    // Start at MAX_PITCH and try to tilt further toward horizon (fingers up).
    // Expected: pitch stays at MAX_PITCH.
    const MAX_PITCH = (-15 * Math.PI) / 180;
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.pitch = MAX_PITCH;

    fire(canvas, 'touchstart', [t(0, 0),   t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, -20), t(100, -20)]);
    fire(canvas, 'touchmove',  [t(0, -40), t(100, -40)]);

    const hpr = (camera.lookAt.mock.calls[0] as any[])[1];
    expect(hpr.pitch).toBeCloseTo(MAX_PITCH, 5);
  });

  it('pitch is clamped at MIN_PITCH (−π/2) — cannot tilt past straight-down limit', () => {
    // Start at MIN_PITCH and try to tilt further toward nadir (fingers down).
    // Expected: pitch stays at −π/2.
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.pitch = -Math.PI / 2;

    fire(canvas, 'touchstart', [t(0, 0),  t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 20), t(100, 20)]);
    fire(canvas, 'touchmove',  [t(0, 40), t(100, 40)]);

    const hpr = (camera.lookAt.mock.calls[0] as any[])[1];
    expect(hpr.pitch).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('applies the correct pitch delta based on TILT_SENSITIVITY (0.003 rad/px)', () => {
    // newPitch = clamp(pitch − dMidY * 0.003, ...)
    // dMidY = −20 → delta = +0.06 rad
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.pitch = -Math.PI / 4;

    fire(canvas, 'touchstart', [t(0, 0),   t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, -20), t(100, -20)]);
    fire(canvas, 'touchmove',  [t(0, -40), t(100, -40)]);

    const TILT_SENSITIVITY = 0.003;
    const dMidY = -20;
    const expected = camera.pitch - dMidY * TILT_SENSITIVITY; // no clamping needed here

    const hpr = (camera.lookAt.mock.calls[0] as any[])[1];
    expect(hpr.pitch).toBeCloseTo(expected, 5);
  });
});

// ── Zoom gesture ──────────────────────────────────────────────────────────────

describe('zoom gesture', () => {
  // Zoom scenario: fingers spread apart symmetrically, no angle or midY change.
  //   Start: A=(0,0) B=(100,0)  → dist=100
  //   Move:  A=(−15,0) B=(115,0) → dist=130; dDist=30 > 15, dMidY=0, dAngle=0 → zoom

  it('classifies pure finger spread as zoom', () => {
    // Indirect proof: zoom re-enables SSC (documented behavior for zoom hand-off).
    const { viewer, ssc } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0),   t(100, 0)]);
    fire(canvas, 'touchmove',  [t(-15, 0), t(115, 0)]);

    expect(ssc.enableInputs).toBe(true);
  });

  it('does NOT call camera.lookAt during zoom — Cesium handles pinch-zoom natively', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0),   t(100, 0)]);
    fire(canvas, 'touchmove',  [t(-15, 0), t(115, 0)]); // classify as zoom
    fire(canvas, 'touchmove',  [t(-30, 0), t(130, 0)]); // further zoom

    expect(camera.lookAt).not.toHaveBeenCalled();
  });
});

// ── Angle-jump filter ─────────────────────────────────────────────────────────

describe('angle-jump filter (atan2 sign-flip suppression)', () => {
  // When two fingers cross the ±π wrap boundary, atan2 flips sign and produces
  // a spurious huge delta. Any |dAngle| > ANGLE_JUMP_LIMIT (0.3 rad) is clamped
  // to zero so the camera doesn't snap.

  it('filters out large angle deltas (> 0.3 rad) and applies zero heading change', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);
    camera.heading = 0;

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(98,  17)]); // classify as rotate
    // Apply frame: angle = atan2(200, 50) ≈ 1.326 rad
    // prev angle  = atan2(17,  98) ≈ 0.172 rad
    // rawDAngle   ≈ 1.154 > 0.3 → filtered to 0
    fire(canvas, 'touchmove',  [t(0, 0), t(50, 200)]);

    // lookAt was called (gesture is locked) but heading must be unchanged
    expect(camera.lookAt).toHaveBeenCalled();
    const hpr = (camera.lookAt.mock.calls[0] as any[])[1];
    expect(hpr.heading).toBeCloseTo(camera.heading, 5); // heading + 0
  });
});

// ── Range stability across consecutive moves ──────────────────────────────────

describe('range stability (camera.positionWC, not camera.position)', () => {
  // After camera.lookAt() is called, Cesium puts the camera in a local reference
  // frame. camera.position then returns a LOCAL vector — NOT world coordinates.
  // distance(camera.position, pivot) on the second move computes distance between
  // a local vector and a world Cartesian3, producing a nonsense ~Mars-radius value.
  // The camera teleports to deep space → Cesium throws RangeError: Invalid array length.
  // camera.positionWC always returns world coordinates regardless of active frame.

  it('tilt: Cartesian3.distance is called with positionWC after first lookAt contaminates position', () => {
    const { viewer, camera } = makeViewer(canvas);

    // Simulate Cesium's behaviour: after lookAt(), camera.position becomes a
    // small local-frame vector. camera.positionWC stays in world coordinates.
    camera.lookAt.mockImplementationOnce(() => {
      camera.position = { x: 999, y: 999, z: 999 }; // local-frame garbage
      // camera.positionWC is intentionally left unchanged
    });

    initTouchControls(viewer);
    fire(canvas, 'touchstart', [t(0, 0),   t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, -20), t(100, -20)]); // classify
    fire(canvas, 'touchmove',  [t(0, -40), t(100, -40)]); // apply #1 → lookAt called, position poisoned
    fire(canvas, 'touchmove',  [t(0, -60), t(100, -60)]); // apply #2 → must read positionWC

    // distance() is called once per apply frame; check the arg on the second call
    const distanceCalls = vi.mocked(Cesium.Cartesian3.distance).mock.calls;
    expect(distanceCalls).toHaveLength(2);
    // First arg must be positionWC — NOT the contaminated camera.position
    expect(distanceCalls[1][0]).toBe(camera.positionWC);
    expect(distanceCalls[1][0]).not.toBe(camera.position);
  });

  it('rotate: Cartesian3.distance is called with positionWC after first lookAt contaminates position', () => {
    const { viewer, camera } = makeViewer(canvas);

    camera.lookAt.mockImplementationOnce(() => {
      camera.position = { x: 999, y: 999, z: 999 }; // local-frame garbage
    });

    initTouchControls(viewer);
    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchmove',  [t(0, 0), t(98,  17)]); // classify
    fire(canvas, 'touchmove',  [t(0, 0), t(96,  34)]); // apply #1 → position poisoned
    fire(canvas, 'touchmove',  [t(0, 0), t(94,  50)]); // apply #2 → must read positionWC

    const distanceCalls = vi.mocked(Cesium.Cartesian3.distance).mock.calls;
    expect(distanceCalls).toHaveLength(2);
    expect(distanceCalls[1][0]).toBe(camera.positionWC);
    expect(distanceCalls[1][0]).not.toBe(camera.position);
  });
});

// ── State reset after gesture ends ───────────────────────────────────────────

describe('state resets to idle after touchend', () => {
  it('touchmove after touchend does not call camera.lookAt (state is idle)', () => {
    const { viewer, camera } = makeViewer(canvas);
    initTouchControls(viewer);

    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchend',   []);

    camera.lookAt.mockClear();

    // A move after the gesture ended — should be a no-op
    fire(canvas, 'touchmove', [t(10, 0), t(110, 0)]);

    expect(camera.lookAt).not.toHaveBeenCalled();
  });

  it('a fresh two-finger touch after touchend starts a new gesture cleanly', () => {
    const { viewer, camera, ssc } = makeViewer(canvas);
    initTouchControls(viewer);

    // First gesture
    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);
    fire(canvas, 'touchend',   []);

    // Second gesture — SSC should be disabled again
    fire(canvas, 'touchstart', [t(0, 0), t(100, 0)]);

    expect(ssc.enableInputs).toBe(false);
  });
});
