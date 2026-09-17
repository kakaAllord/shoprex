'use client';

import { useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * The one way an "add" or "edit" form appears anywhere in this console: a
 * button, and a panel that slides in from the right with everything else
 * dimmed behind it. Used instead of a bulky form sitting permanently on the
 * page, or a second route to navigate to and back from.
 *
 * Fields inside stack in a single column — the panel's width does not follow
 * the viewport the way the page behind it does, so a multi-column grid meant
 * for a full page would cram here regardless of screen size.
 */
export function SidePanel({
  trigger,
  title,
  description,
  children,
  className,
  onOpenChange,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Told alongside the panel's own open state — for a parent that resets its own form state on close. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className={cn('flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md', className)}>
        <div className="flex flex-col gap-1 pr-8">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}
