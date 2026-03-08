import React from 'react';
import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import './ui.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    noPadding?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, noPadding = false, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={clsx('ui-card', noPadding && 'ui-card--no-padding', className)}
                {...props}
            >
                {children}
            </div>
        );
    }
);
Card.displayName = 'Card';
