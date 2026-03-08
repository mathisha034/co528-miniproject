import React from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import './ui.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
        return (
            <button
                ref={ref}
                disabled={disabled || isLoading}
                className={clsx(
                    'ui-button',
                    `ui-button--${variant}`,
                    `ui-button--${size}`,
                    isLoading && 'ui-button--loading',
                    className
                )}
                {...props}
            >
                {isLoading && <span className="ui-button__spinner" />}
                {!isLoading && children}
            </button>
        );
    }
);
Button.displayName = 'Button';
