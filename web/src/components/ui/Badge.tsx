import React from 'react';
import { clsx } from 'clsx';
import './ui.css';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = 'default', children, ...props }, ref) => {
        return (
            <span
                ref={ref}
                className={clsx('ui-badge', `ui-badge--${variant}`, className)}
                {...props}
            >
                {children}
            </span>
        );
    }
);
Badge.displayName = 'Badge';
