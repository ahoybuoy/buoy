import React from 'react';
export const Button = ({children}) => (
  <button style={{ backgroundColor: 'var(--colors-primary)', padding: 'var(--spacing-sm) var(--spacing-md)', borderRadius: 'var(--radius-sm)' }}>{children}</button>
);
