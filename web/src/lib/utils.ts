import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting a later Tailwind utility beat an earlier one of
 * the same kind. The shadcn/ui convention, and the reason a component can
 * accept `className` without every caller having to know what it overrides.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
