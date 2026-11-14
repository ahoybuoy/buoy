import React from 'react';
export const Button = ({children}) => (
  <button style={{ backgroundColor: 'hsl(217, 91%, 60%)', padding: 'var(--spacing-sm) var(--spacing-md)', borderRadius: 'var(--radius-sm)' }}>{children}</button>
);
