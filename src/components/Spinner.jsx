// src/components/Spinner.jsx
import React from 'react';

function Spinner({ show }) {
  if (!show) return null;

  return (
    <div className="spinner-overlay">
      <div className="spinner"></div>
    </div>
  );
}

export default Spinner;