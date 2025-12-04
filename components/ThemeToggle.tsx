import React, { useState, useRef, useEffect } from "react";
import { Moon, Sun, Monitor, MoreHorizontal } from "lucide-react";
import { useTheme } from "./theme-provider";
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
              setIsOpen(false);
          }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
        <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
            title="Switch Theme"
        >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute top-2 left-2 h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
        </button>
        
        {isOpen && (
            <div className="absolute right-0 top-full mt-2 w-36 bg-popover border border-border rounded-md shadow-md z-50 overflow-hidden">
                <button
                    onClick={() => { setTheme("light"); setIsOpen(false); }}
                    className={cn(
                        "flex items-center w-full px-4 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground",
                        theme === 'light' && "bg-accent/50"
                    )}
                >
                    <Sun className="mr-2 h-4 w-4" />
                    Light
                </button>
                <button
                    onClick={() => { setTheme("dark"); setIsOpen(false); }}
                    className={cn(
                        "flex items-center w-full px-4 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground",
                        theme === 'dark' && "bg-accent/50"
                    )}
                >
                    <Moon className="mr-2 h-4 w-4" />
                    Dark
                </button>
                <button
                    onClick={() => { setTheme("system"); setIsOpen(false); }}
                    className={cn(
                        "flex items-center w-full px-4 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground",
                        theme === 'system' && "bg-accent/50"
                    )}
                >
                    <Monitor className="mr-2 h-4 w-4" />
                    System
                </button>
            </div>
        )}
    </div>
  );
}