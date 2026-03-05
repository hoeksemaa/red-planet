// Lightweight load-time profiling using the native Performance API.
// Marks appear in DevTools → Performance → Timings lane.
// Call report() once to dump a console table with deltas.

const PREFIX = 'rp:';

export function mark(name: string): void {
  performance.mark(PREFIX + name);
}

export function report(): void {
  const marks = performance.getEntriesByType('mark')
    .filter(e => e.name.startsWith(PREFIX))
    .map(e => ({ name: e.name.slice(PREFIX.length), t: e.startTime }));

  console.group('%c[perf] Load timeline', 'color: #FF9500; font-weight: bold');
  console.table(
    marks.map((m, i) => ({
      event:       m.name,
      'time (ms)': m.t.toFixed(1),
      'delta (ms)': i > 0 ? (m.t - marks[i - 1].t).toFixed(1) : '—',
    }))
  );
  console.groupEnd();

  // Cesium.js resource timing — download vs. decode size reveals gzip ratio,
  // and responseEnd - fetchStart shows total wall-clock cost before JS can parse it.
  const cesium = performance.getEntriesByType('resource')
    .find(e => e.name.includes('Cesium.js')) as PerformanceResourceTiming | undefined;

  if (cesium) {
    const dl   = cesium.responseEnd - cesium.responseStart;
    const wait = cesium.responseStart - cesium.fetchStart;
    console.group('%c[perf] Cesium.js network', 'color: #FF9500; font-weight: bold');
    console.table({
      'wait / TTFB (ms)':   wait.toFixed(1),
      'download (ms)':      dl.toFixed(1),
      'transfer size (KB)': (cesium.transferSize / 1024).toFixed(0),
      'decoded size (KB)':  (cesium.decodedBodySize / 1024).toFixed(0),
      'gzip ratio':         cesium.transferSize > 0
        ? (cesium.decodedBodySize / cesium.transferSize).toFixed(1) + 'x'
        : 'cached',
    });
    console.groupEnd();
  } else {
    console.warn('[perf] Cesium.js not found in resource timing (may be cross-origin or cached without Timing-Allow-Origin)');
  }
}