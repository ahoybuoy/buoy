import React from 'react';
export const Button = ({children}) => (
  <button style={{ backgroundColor: 'rgb(59, 130, 246)', padding: 'var(--spacing-sm) var(--spacing-md)', borderRadius: 'var(--radius-sm)' }}>{children}</button>
);
