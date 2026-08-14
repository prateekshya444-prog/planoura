import React from 'react';

export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`btn btn-primary ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`btn btn-secondary ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`btn btn-ghost ${className}`}
    >
      {children}
    </button>
  );
}

export function DestructiveButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`btn btn-destructive ${className}`}
    >
      {children}
    </button>
  );
}

export function ChoiceRow({ value, onChange, options, disabled }) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`choice-chip ${value === option ? 'choice-chip-active' : ''}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function FieldLabel({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="planora-label">
      {children}
    </label>
  );
}

export function TextInput({ className = '', ...props }) {
  return <input className={`planora-input ${className}`} {...props} />;
}

export function SelectInput({ className = '', children, ...props }) {
  return (
    <select className={`planora-input ${className}`} {...props}>
      {children}
    </select>
  );
}
