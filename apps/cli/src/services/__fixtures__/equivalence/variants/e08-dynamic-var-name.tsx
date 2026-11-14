import React from 'react';
export const Button = ({children, tone = 'primary'}) => (
  <button style={{ backgroundColor: `var(--colors-${tone})`, padding: 'var(--spacing-sm) var(--spacing-md)', borderRadius: 'var(--radius-sm)' }}>{children}</button>
);
