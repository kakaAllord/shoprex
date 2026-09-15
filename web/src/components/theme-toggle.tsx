'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const OPTIONS = [
  { value: 'light', label: 'Mwanga · Light', Icon: SunIcon },
  { value: 'dark', label: 'Giza · Dark', Icon: MoonIcon },
  { value: 'system', label: 'Ya simu · System', Icon: MonitorIcon },
] as const;

/**
 * Renders a neutral placeholder until mounted. The server cannot know which
 * theme the browser resolved, and painting the wrong icon first is a flicker
 * on every single page load.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const Current = !mounted ? MonitorIcon : resolvedTheme === 'dark' ? MoonIcon : SunIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <Current />
          <span className="sr-only">Badilisha mwonekano · Change theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon />
            <span className="flex-1">{label}</span>
            {mounted && theme === value ? <CheckIcon className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
