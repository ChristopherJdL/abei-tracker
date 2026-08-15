import React from 'react';
import './PixelButton.css';

interface PixelButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  variant?: 'orange' | 'blue' | 'red';
  isSquare?: boolean;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export function PixelButton({
  children,
  onClick,
  type = 'button',
  disabled = false,
  variant = 'orange',
  isSquare = false,
  className = '',
  style,
  ariaLabel,
}: PixelButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`pixel-button pixel-button--${variant} ${isSquare ? 'pixel-button--square' : ''} ${className}`}
      style={style}
    >
      <span className="pixel-button__surface">{children}</span>
    </button>
  );
}
