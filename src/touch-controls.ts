import * as Cesium from 'cesium';

// --- constants ---

const CLASSIFY_THRESHOLD = 15;                        // px accumulated before gesture locks
const TILT_SENSITIVITY   = 0.003;                     // rad/px
const MIN_PITCH          = -Math.PI / 2;              // straight down
const MAX_PITCH          = Cesium.Math.toRadians(-15); // near horizon
const INERTIA_DECAY      = 0.72;                      // decay per frame at 60fps; 0.85 was too floaty
const INERTIA_EPSILON    = 0.0001;                    // rad — stop threshold
const ANGLE_JUMP_LIMIT   = 0.3;                       // rad — discard atan2 sign-flip noise

// --- state machine types ---

type GestureState =
  | { phase: 'idle' }
  | { phase: 'recognizing';
      prev: [Touch, Touch];
      acc: { angle: number; midY: number; dist: number }; }
  | { phase: 'locked';
      gesture: 'rotate' | 'tilt' | 'zoom';
      prev: [Touch, Touch];
      target: Cesium.Cartesian3 | null;  // ellipsoid pivot for orbit-rotate (null = off-globe)
      lastVelocity: number;              // rolling average of recentDeltas; used to seed inertia
      recentDeltas: number[]; };         // last 3 per-frame deltas for smoothed velocity

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

  let state: GestureState = { phase: 'idle' };
  let inertiaRaf: number | null = null;

  function cancelInertia() {
    if (inertiaRaf !== null) {
      cancelAnimationFrame(inertiaRaf);
      inertiaRaf = null;
    }
  }

  function exitLookAt() {
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  function applyRotate(target: Cesium.Cartesian3 | null, dAngle: number) {
    const pivot = target ?? camera.positionWC;
    const range = Cesium.Cartesian3.distance(camera.position, pivot);
    camera.lookAt(pivot, new Cesium.HeadingPitchRange(camera.heading + dAngle, camera.pitch, range));
  }

  function applyTilt(dMidY: number, target: Cesium.Cartesian3 | null) {
    const pivot = target ?? camera.positionWC;
    const range = Cesium.Cartesian3.distance(camera.position, pivot);
    // fingers up (dMidY < 0) → tilt toward horizon (pitch increases toward 0)
    const newPitch = Cesium.Math.clamp(
      camera.pitch - dMidY * TILT_SENSITIVITY,
      MIN_PITCH,
      MAX_PITCH,
    );
    camera.lookAt(pivot, new Cesium.HeadingPitchRange(camera.heading, newPitch, range));
  }

  function startInertia(gesture: 'rotate' | 'tilt', velocity: number, target: Cesium.Cartesian3 | null) {
    let v = velocity;
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
        applyTilt(v, target);
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

    // raycast midpoint to ellipsoid for orbit pivot
    const midX = (t1.clientX + t2.clientX) / 2;
    const midY = (t1.clientY + t2.clientY) / 2;
    const rect  = canvas.getBoundingClientRect();
    const cx    = (midX - rect.left) * (canvas.width  / rect.width);
    const cy    = (midY - rect.top)  * (canvas.height / rect.height);
    const target = camera.pickEllipsoid(new Cesium.Cartesian2(cx, cy)) ?? null;

    // disable SSC immediately so Cesium doesn't process these touch events
    // during recognition — prevents camera snap when we take over at lock-in
    ssc.enableInputs = false;

    state = {
      phase: 'recognizing',
      prev:  [t1, t2],
      acc:   { angle: 0, midY: 0, dist: 0 },
    };

    // stash target on state so touchmove can access it after lock
    (state as any)._target = target;
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
      state.acc.angle += Math.abs(dAngle) * (180 / Math.PI) * 10; // scale radians → comparable px units
      state.acc.midY  += Math.abs(dMidY);
      state.acc.dist  += dDist;

      const max = Math.max(state.acc.angle, state.acc.midY, state.acc.dist);
      if (max >= CLASSIFY_THRESHOLD) {
        const gesture: 'rotate' | 'tilt' | 'zoom' =
          state.acc.angle >= state.acc.midY && state.acc.angle >= state.acc.dist ? 'rotate' :
          state.acc.midY  >= state.acc.dist                                      ? 'tilt'   :
                                                                                   'zoom';
        const target: Cesium.Cartesian3 | null = (state as any)._target ?? null;

        state = { phase: 'locked', gesture, prev: [t1, t2], target, lastVelocity: 0, recentDeltas: [] };

        if (gesture === 'zoom') {
          // hand zoom back to Cesium — re-enable SSC which we killed on touchstart
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
        applyRotate(state.target, dAngle * 0.5);
      } else if (state.gesture === 'tilt') {
        state.recentDeltas.push(dMidY);
        if (state.recentDeltas.length > 3) state.recentDeltas.shift();
        state.lastVelocity = state.recentDeltas.reduce((s, v) => s + v, 0) / state.recentDeltas.length;
        applyTilt(dMidY, state.target);
      }
      // zoom: do nothing — Cesium handles it
      state.prev = [t1, t2];
    }
  }, { passive: true });

  function onTouchEnd() {
    ssc.enableInputs = true;

    if (state.phase === 'locked' && state.gesture !== 'zoom' && Math.abs(state.lastVelocity) > INERTIA_EPSILON) {
      const { gesture, target, lastVelocity } = state;
      startInertia(gesture, lastVelocity, target);
    } else {
      exitLookAt();
    }

    state = { phase: 'idle' };
  }

  canvas.addEventListener('touchend',    onTouchEnd, { passive: true });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: true });
}
