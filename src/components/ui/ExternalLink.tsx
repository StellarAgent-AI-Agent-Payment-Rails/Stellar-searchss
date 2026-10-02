import React, { forwardRef } from 'react'

export interface ExternalLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: React.ReactNode
}

export const ExternalLink = forwardRef<HTMLAnchorElement, ExternalLinkProps>(
  ({ children, ...props }, ref) => {
    return (
      <a target="_blank" rel="noopener noreferrer" ref={ref} {...props}>
        {children}
      </a>
    )
  },
)
