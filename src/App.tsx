import React, { useState, useCallback } from 'react';
import './App.css';
import { LoadingView } from './components/LoadingView';
import { MapView } from './components/MapView';

type LoadStatus = 'loading' | 'hiding' | 'done';

export function App() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const handleReady = useCallback(() => {
    setStatus('hiding');
    setTimeout(() => setStatus('done'), 600);
  }, []);

  const isLoading = status !== 'done';

  return (
    <>
      {/* Globe — always mounted so Cesium initialises immediately */}
      <MapView onProgress={setProgress} onReady={handleReady} />

      {/* Overlay — visible until tiles are rendered, then fades out and unmounts */}
      {isLoading && (
        <LoadingView progress={progress} hiding={status === 'hiding'} />
      )}
    </>
  );
}
