"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("rais-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("rais-theme", "light");
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light/dark mode"
      className="fixed top-4 right-4 z-[100] w-10 h-10 rounded-full glass flex items-center justify-center text-text-secondary hover:text-accent transition-colors duration-200"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
