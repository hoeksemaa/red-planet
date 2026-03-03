import React from 'react';

interface Props {
  progress: number;
  hiding: boolean;
}

export function LoadingView({ progress, hiding }: Props) {
  return (
    <div className={`loading-screen${hiding ? ' loading-screen--hidden' : ''}`}>
      <div className="loading-content">
        <p className="loading-label">Loading Mars…</p>
        <div className="loading-bar-track">
          <div className="loading-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
