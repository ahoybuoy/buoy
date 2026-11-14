import React from 'react';
export const Button = ({children}) => (
  <button className="bg-[var(--colors-primary)] px-[var(--spacing-md)] py-[var(--spacing-sm)] rounded-[var(--radius-sm)]">{children}</button>
);
