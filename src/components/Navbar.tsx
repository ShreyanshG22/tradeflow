
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { cn } from '@/lib/utils';
import { Moon, Sun, Menu, X } from 'lucide-react';

interface NavbarProps {
  onThemeToggle: () => void;
  isDarkTheme: boolean;
}

export function Navbar({ onThemeToggle, isDarkTheme }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out",
        scrolled ? "py-3 backdrop-blur-lg bg-background/80 shadow-sm" : "py-5"
      )}
    >
      <div className="container flex items-center justify-between">
        <div className="flex items-center">
          <a href="/" className="flex items-center gap-2">
            <div className="relative w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
              <span className="text-primary-foreground font-semibold">T</span>
            </div>
            <span className="font-semibold text-xl">TradeFlow</span>
          </a>
        </div>

        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center space-x-8">
          <a href="#features" className="text-sm font-medium hover:text-primary transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-medium hover:text-primary transition-colors">
            How It Works
          </a>
          <a href="#pricing" className="text-sm font-medium hover:text-primary transition-colors">
            Pricing
          </a>
          <Button onClick={onThemeToggle} variant="ghost" size="icon" className="rounded-full">
            {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <Button asChild>
            <a href="#waitlist">Join Waitlist</a>
          </Button>
        </nav>

        {/* Mobile menu button */}
        <div className="flex items-center md:hidden gap-2">
          <Button onClick={onThemeToggle} variant="ghost" size="icon" className="rounded-full">
            {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-full"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 p-4 backdrop-blur-xl bg-background/95 border-b border-border md:hidden">
            <nav className="flex flex-col space-y-4 py-2">
              <a 
                href="#features" 
                className="text-sm font-medium p-2 hover:bg-muted rounded-md transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Features
              </a>
              <a 
                href="#how-it-works" 
                className="text-sm font-medium p-2 hover:bg-muted rounded-md transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                How It Works
              </a>
              <a 
                href="#pricing" 
                className="text-sm font-medium p-2 hover:bg-muted rounded-md transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </a>
              <Button asChild className="w-full">
                <a href="#waitlist" onClick={() => setMobileMenuOpen(false)}>Join Waitlist</a>
              </Button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
