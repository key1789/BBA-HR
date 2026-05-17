"use client";

import React from "react";

interface CurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  name?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export function CurrencyInput({ 
  value, 
  onChange, 
  name, 
  placeholder, 
  className, 
  required,
  disabled 
}: CurrencyInputProps) {
  // Format number to IDR style (dots as thousand separator)
  const formatNumber = (num: number | string) => {
    if (!num && num !== 0) return "";
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  // Strip all non-numeric characters
  const parseNumber = (str: string) => {
    return parseInt(str.replace(/\./g, "")) || 0;
  };

  const displayValue = formatNumber(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    // Only allow numbers and dots
    const cleanValue = rawValue.replace(/[^0-9.]/g, "");
    const numericValue = parseNumber(cleanValue);
    
    onChange(numericValue);
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={className}
      />
      {/* Hidden input to hold the actual numeric value for form submissions if needed */}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
