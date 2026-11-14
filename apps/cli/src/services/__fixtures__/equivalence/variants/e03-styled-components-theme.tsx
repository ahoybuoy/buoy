import React from 'react';
import styled from 'styled-components';
const Btn = styled.button`
  background-color: ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.radius.sm};
`;
export const Button = ({children}) => <Btn>{children}</Btn>;
