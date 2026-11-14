import React from 'react';
const buttonStyle = {
  backgroundColor: 'var(--colors-primary)',
  padding: 'var(--spacing-sm) var(--spacing-md)',
  borderRadius: 'var(--radius-sm)',
};
export const Button = ({children}) => <button style={{ ...buttonStyle }}>{children}</button>;
