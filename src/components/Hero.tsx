
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="pt-32 pb-20 overflow-hidden">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col items-center text-center space-y-10">
          <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-muted/50 text-muted-foreground backdrop-blur-sm border border-border mb-4 opacity-0 animate-fade-in">
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Limited Beta Access
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tighter md:leading-none max-w-3xl text-balance opacity-0 animate-fade-in animation-delay-200">
            Build & Automate Your Trading Strategies—No Code Required
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-[42rem] text-balance opacity-0 animate-fade-in animation-delay-400">
            Drag & Drop | Backtest Instantly | Auto-Execute on NSE/BSE
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center opacity-0 animate-fade-in animation-delay-600">
            <Button asChild size="lg" className="rounded-full px-8">
              <a href="#waitlist">Join Waitlist</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-8">
              <a href="#trial">Start Free Trial</a>
            </Button>
          </div>

          <div className="mt-16 w-full max-w-5xl mx-auto relative">
            <div className="absolute inset-0 bg-gradient-radial from-primary/5 to-transparent -z-10 rounded-xl"></div>
            <div className="aspect-[16/9] rounded-xl overflow-hidden shadow-2xl border border-border relative group">
              <div className="absolute inset-0 bg-background/10 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <Button className="rounded-full">Watch Demo</Button>
              </div>
              <img 
                src="https://images.unsplash.com/photo-1531297484001-80022131f5a1" 
                alt="Trading Platform Dashboard" 
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="absolute -top-12 -right-12 w-36 h-36 bg-primary/5 rounded-full blur-3xl -z-10"></div>
            <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-primary/5 rounded-full blur-3xl -z-10"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
