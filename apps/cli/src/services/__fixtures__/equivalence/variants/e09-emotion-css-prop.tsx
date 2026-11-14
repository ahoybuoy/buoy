import React from 'react';
import { css } from '@emotion/react';
const base = css`
  background-color: var(--colors-primary);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-sm);
`;
export const Button = ({children}) => <button css={base}>{children}</button>;
