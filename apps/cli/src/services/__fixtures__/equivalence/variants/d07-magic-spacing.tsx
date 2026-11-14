import React from 'react';
export const Button = ({children}) => (
  <button style={{ backgroundColor: 'var(--colors-primary)', padding: '13px 17px', borderRadius: 'var(--radius-sm)' }}>{children}</button>
);
