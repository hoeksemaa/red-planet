import * as Cesium from 'cesium';

// --- constants ---

// Per-axis classification thresholds — each gesture competes on its own scale.
// Raise THRESHOLD.angle to bias away from rotate; raise all three to require more
// deliberate movement before locking in (at the cost of slightly later lock-in).
const THRESHOLD = {
  angle: 0.10,  // radians (~5.7°) — raised; finger wobble during tilt is typically <1°
  midY:  18,    // px of accumulated vertical midpoint movement
  dist:  18,    // px of accumulated finger-distance change
};
const TILT_SENSITIVITY   = 0.003;                     // rad/px
const MIN_PITCH          = -Math.PI / 2;              // straight down
const MAX_PITCH          = Cesium.Math.toRadians(-15); // near horizon
const INERTIA_DECAY      = 0;                         // disabled — set to ~0.72 to re-enable
const INERTIA_EPSILON    = 0.0001;                    // rad — stop threshold
const ANGLE_JUMP_LIMIT   = 0.3;                       // rad — discard atan2 sign-flip noise
const MARS_RADIUS_M      = 3_390_000;
const MIN_RANGE_M        = 100;                        // < 100 m = inside terrain, reject
const MAX_RANGE_M        = MARS_RADIUS_M * 20;         // ~67 Mm — well above any useful orbit

// --- state machine types ---

type GestureState =
  | { phase: 'idle' }
  | { phase: 'recognizing';
      prev: [Touch, Touch];
      acc: { angle: number; midY: number; dist: number }; }
  | { phase: 'locked';
      gesture: 'rotate' | 'tilt' | 'zoom';
      prev: [Touch, Touch];
      target: Cesium.Cartesian3 | null;  // ellipsoid pivot for orbit (rotate & tilt); null = off-globe or zoom
      lastVelocity: number;              // rolling average of recentDeltas; used to seed inertia
      recentDeltas: number[];            // last 3 per-frame deltas for smoothed velocity
      tiltPitch: number; };              // explicit HPR pitch — never read camera.pitch during tilt

// --- geometry helper ---

function geo(a: Touch, b: Touch) {
  return {
    angle: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX),
    midY:  (a.clientY + b.clientY) / 2,
    dist:  Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
  };
}

// --- entry point ---

export function initTouchControls(viewer: Cesium.Viewer): void {
  const canvas  = viewer.scene.canvas;
  const camera  = viewer.camera;
  const ssc     = viewer.scene.screenSpaceCameraController;

  // Disable Cesium's native tilt gesture entirely — our 2-finger tilt replaces it.
  // Without this, SSC can push the camera outside MIN_PITCH/MAX_PITCH bounds between
  // gestures, seeding readTiltPitch() with an out-of-range value.
  ssc.tiltEventTypes = [];

  let state: GestureState = { phase: 'idle' };
  let inertiaRaf: number | null = null;

  function cancelInertia() {
    if (inertiaRaf !== null) {
      cancelAnimationFrame(inertiaRaf);
      inertiaRaf = null;
      exitLookAt(); // camera.position is in lookAt local frame until we release it
    }
  }

  function exitLookAt() {
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  // Validates pivot and range, then calls camera.lookAt and restores IDENTITY.
  // All camera motion flows through here so the "sane range" invariant is enforced
  // in one place rather than trusted implicitly at each call site.
  // Returns false (and logs a warning) if the move would be unsafe, e.g. pivot is
  // NaN/Infinity or range would place the camera outside the valid Mars orbit band.
  // Note: caller must set the ENU frame via lookAtTransform before calling, so that
  // camera.heading/pitch are geographic when read into the HeadingPitchRange.
  function safeLookAt(
    pivot: Cesium.Cartesian3,
    heading: number,
    pitch: number,
    label: string,
  ): boolean {
    const pivotOk = isFinite(pivot.x) && isFinite(pivot.y) && isFinite(pivot.z);
    if (!pivotOk) {
      console.warn(`[touch-controls] ${label}: rejected — invalid pivot`);
      exitLookAt();
      return false;
    }
    const range = Cesium.Cartesian3.distance(camera.positionWC, pivot);
    if (!isFinite(range) || range < MIN_RANGE_M || range > MAX_RANGE_M) {
      console.warn(`[touch-controls] ${label}: rejected — range=${range.toFixed(0)}m`);
      exitLookAt();
      return false;
    }
    camera.lookAt(pivot, new Cesium.HeadingPitchRange(heading, pitch, range));
    // Restore IDENTITY so SSC.update() never sees a local-frame camera.position
    // (it runs every render frame regardless of enableInputs).
    exitLookAt();
    return true;
  }

  function applyRotate(target: Cesium.Cartesian3 | null, dAngle: number) {
    const pivot = target ?? camera.positionWC;
    // Switch to ENU frame at pivot before reading heading/pitch so camera.heading
    // is geographic (not raw ECEF-axis) before passing to HeadingPitchRange.
    camera.lookAtTransform(Cesium.Transforms.eastNorthUpToFixedFrame(pivot));
    safeLookAt(pivot, camera.heading - dAngle, camera.pitch, 'rotate');
  }

  function applyTilt(pivot: Cesium.Cartesian3 | null, pitch: number) {
    // Orbit around the surface pivot point (same mechanic as applyRotate, pitch axis instead
    // of heading).  The pivot stays fixed in the view as the camera arcs toward the horizon.
    // Fallback to positionWC if the pivot was off-globe at lock-in time.
    const p = pivot ?? camera.positionWC;
    // ENU at pivot so camera.heading is geographic before passing to HeadingPitchRange.
    camera.lookAtTransform(Cesium.Transforms.eastNorthUpToFixedFrame(p));
    safeLookAt(p, camera.heading, pitch, 'tilt');
  }

  // Compute the HPR pitch of the camera's current POSITION relative to a nadir pivot.
  // This is NOT camera.pitch (viewing direction) — those are two different things.
  //
  // applyTilt uses camera.lookAt(nadir, HeadingPitchRange(heading, pitch, range)), where
  // HPR.pitch describes WHERE the camera sits relative to the nadir, not where it's looking.
  // Seeding tiltPitch with camera.pitch instead would snap the camera on the first applyTilt:
  // camera above nadir = HPR.pitch -π/2, but camera looking 30° down = camera.pitch -30°,
  // so passing -30° as HPR.pitch teleports the camera from directly-above to a tilted orbit.
  //
  // Formula: in ENU at nadir, camera is at local offset (x, y, z). Cesium's pitch convention
  // is 0 = horizontal, -π/2 = above (positive z), so pitch = atan2(-z, horizontal).
  function readTiltPitch(nadir: Cesium.Cartesian3): number {
    camera.lookAtTransform(Cesium.Transforms.eastNorthUpToFixedFrame(nadir));
    const pos = camera.position; // local ENU offset from nadir
    const horizontal = Math.hypot(pos.x, pos.y);
    const pitch = Math.atan2(-pos.z, horizontal);
    // lookAtTransform is a side-effect — restore IDENTITY so this helper doesn't
    // leave the camera in a non-IDENTITY frame (bug fix 4).
    exitLookAt();
    return pitch;
  }

  function startInertia(gesture: 'rotate' | 'tilt', velocity: number, target: Cesium.Cartesian3 | null, tiltPitch: number) {
    let v = velocity;
    let pitch = tiltPitch;
    function tick() {
      v *= INERTIA_DECAY;
      if (Math.abs(v) < INERTIA_EPSILON) {
        exitLookAt();
        inertiaRaf = null;
        return;
      }
      if (gesture === 'rotate') {
        applyRotate(target, v);
      } else {
        pitch = Cesium.Math.clamp(pitch - v * TILT_SENSITIVITY, MIN_PITCH, MAX_PITCH);
        applyTilt(target, pitch);
      }
      inertiaRaf = requestAnimationFrame(tick);
    }
    inertiaRaf = requestAnimationFrame(tick);
  }

  // --- event handlers ---

  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    cancelInertia();

    if (e.touches.length !== 2) {
      state = { phase: 'idle' };
      return;
    }

    const t1 = e.touches[0], t2 = e.touches[1];

    // disable SSC immediately so Cesium doesn't process these touch events
    // during recognition — prevents camera snap when we take over at lock-in
    ssc.enableInputs = false;

    state = {
      phase: 'recognizing',
      prev:  [t1, t2],
      acc:   { angle: 0, midY: 0, dist: 0 },
    };
  }, { passive: true });

  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length !== 2 || state.phase === 'idle') return;

    const t1 = e.touches[0], t2 = e.touches[1];
    const cur  = geo(t1, t2);
    const prev = geo(state.prev[0], state.prev[1]);

    const rawDAngle = cur.angle - prev.angle;
    const dAngle = Math.abs(rawDAngle) > ANGLE_JUMP_LIMIT ? 0 : rawDAngle;
    const dMidY  = cur.midY - prev.midY;
    const dDist  = Math.abs(cur.dist - prev.dist);

    if (state.phase === 'recognizing') {
      state.acc.angle += Math.abs(dAngle); // raw radians — THRESHOLD.angle is in radians, no scaling needed
      state.acc.midY  += Math.abs(dMidY);
      state.acc.dist  += dDist;

      // Each axis scores independently against its own threshold (dimensionless ratio).
      // The gesture with the highest ratio wins once any ratio reaches 1.0.
      const scores = {
        rotate: state.acc.angle / THRESHOLD.angle,
        tilt:   state.acc.midY  / THRESHOLD.midY,
        zoom:   state.acc.dist  / THRESHOLD.dist,
      };
      const max = Math.max(scores.rotate, scores.tilt, scores.zoom);
      if (max >= 1.0) {
        const gesture: 'rotate' | 'tilt' | 'zoom' =
          scores.rotate === max ? 'rotate' :
          scores.tilt   === max ? 'tilt'   :
                                  'zoom';
        // Rotate: orbit around the screen-center surface point (you spin what you're looking at).
        // Tilt: orbit around the nadir — the ellipsoid point directly below the camera.
        //   Using screen-center for tilt is unstable: when already tilted toward the horizon,
        //   pickEllipsoid(center) returns a point near the horizon (thousands of km away).
        //   lookAt(far_pivot, range) then arcs the camera around that distant point, placing
        //   it far outside the scene → LOD tile array overflow → RangeError: Invalid array length.
        //   The nadir is always directly below the camera, so range stays well-behaved.
        // Zoom: Cesium's SSC manages its own pivot internally.
        const pivot = gesture === 'rotate'
          ? camera.pickEllipsoid(new Cesium.Cartesian2(canvas.width / 2, canvas.height / 2)) ?? null
          : gesture === 'tilt'
          ? viewer.scene.globe.ellipsoid.scaleToGeodeticSurface(camera.positionWC) ?? null
          : null;

        // Seed tiltPitch for tilt gestures only — rotate stores it but never uses it.
        // Pass the nadir pivot so readTiltPitch computes HPR position pitch, not viewing pitch.
        // Clamp in case the camera is somehow outside our pitch bounds at lock-in time.
        // Only call readTiltPitch for tilt (not zoom) — it calls lookAtTransform(ENU) and
        // re-enabling SSC immediately after would crash (camera.position not valid ECEF).
        const tiltPitch = gesture === 'tilt' && pivot !== null
          ? Cesium.Math.clamp(readTiltPitch(pivot), MIN_PITCH, MAX_PITCH)
          : MIN_PITCH;

        state = { phase: 'locked', gesture, prev: [t1, t2], target: pivot, lastVelocity: 0, recentDeltas: [], tiltPitch };

        if (gesture === 'zoom') {
          // Reset to IDENTITY frame before handing back to Cesium so camera.position
          // is in valid ECEF space when SSC's update tick runs.
          exitLookAt();
          ssc.enableInputs = true;
        }
      } else {
        state.prev = [t1, t2];
      }
      return;
    }

    // locked phase
    if (state.phase === 'locked') {
      if (state.gesture === 'rotate') {
        state.recentDeltas.push(dAngle);
        if (state.recentDeltas.length > 3) state.recentDeltas.shift();
        state.lastVelocity = state.recentDeltas.reduce((s, v) => s + v, 0) / state.recentDeltas.length;
        applyRotate(state.target, dAngle * 0.75);
      } else if (state.gesture === 'tilt') {
        state.recentDeltas.push(dMidY);
        if (state.recentDeltas.length > 3) state.recentDeltas.shift();
        state.lastVelocity = state.recentDeltas.reduce((s, v) => s + v, 0) / state.recentDeltas.length;
        // fingers up (dMidY < 0) → tilt toward horizon (pitch increases toward 0)
        state.tiltPitch = Cesium.Math.clamp(
          state.tiltPitch - dMidY * TILT_SENSITIVITY,
          MIN_PITCH,
          MAX_PITCH,
        );
        applyTilt(state.target, state.tiltPitch);
      }
      // zoom: do nothing — Cesium handles it
      state.prev = [t1, t2];
    }
  }, { passive: true });

  function onTouchEnd() {
    // Bug fix (1 & 2): always restore IDENTITY before re-enabling SSC.
    // Previously the inertia branch skipped exitLookAt(), leaving the camera in
    // ENU frame while SSC was re-enabled.  Cesium's SSC.update() runs every render
    // frame regardless of enableInputs; with camera.position in local ENU space,
    // cartesianToCartographic returns undefined and .height crashes.
    //
    // applyTilt/applyRotate now call exitLookAt() themselves (bug fix 3), so the
    // camera is already in IDENTITY here — this call is a belt-and-suspenders guard.
    //
    // When inertia is enabled (INERTIA_DECAY > 0), each inertia tick re-enters ENU
    // via applyRotate/applyTilt and exits it again, so SSC stays safe between ticks.
    exitLookAt();

    if (INERTIA_DECAY > 0 &&
        state.phase === 'locked' &&
        state.gesture !== 'zoom' &&
        Math.abs(state.lastVelocity) > INERTIA_EPSILON) {
      const { gesture, target, lastVelocity, tiltPitch } = state;
      startInertia(gesture, lastVelocity, target, tiltPitch);
    }

    state = { phase: 'idle' };
    ssc.enableInputs = true;
  }

  canvas.addEventListener('touchend',    onTouchEnd, { passive: true });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: true });
}
