// Test component to trigger drift detection
import React from 'react';

export function TestDriftComponent() {
  return (
    <div style={{
      color: '#ff0000',
      padding: '16px',
      fontSize: '14px',
      backgroundColor: '#f5f5f5'
    }}>
      <span style={{ marginLeft: '8px', color: 'blue' }}>
        This has hardcoded values
      </span>
    </div>
  );
}
