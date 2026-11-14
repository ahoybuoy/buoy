import React from 'react';
const PRIMARY = 'var(--colors-primary)';
const PAD = 'var(--spacing-sm) var(--spacing-md)';
const RADIUS = 'var(--radius-sm)';
export const Button = ({children}) => (
  <button style={{ backgroundColor: PRIMARY, padding: PAD, borderRadius: RADIUS }}>{children}</button>
);
