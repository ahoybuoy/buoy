import React from 'react';
import { tokens } from '../tokens';
export const Button = ({children}) => (
  <button style={{ backgroundColor: tokens.colors.primary, padding: `${tokens.spacing.sm} ${tokens.spacing.md}`, borderRadius: tokens.radius.sm }}>{children}</button>
);
