
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Workflow, BarChart2, Zap } from 'lucide-react';

export function Features() {
  return (
    <section id="features" className="py-20 relative">
      <div className="container px-4 md:px-6 relative z-10">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-primary mb-2 tracking-wide uppercase">Features</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight max-w-md mx-auto">
            Everything you need to succeed
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            Our platform provides all the tools to build, test, and deploy profitable trading strategies—with zero coding required.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Workflow className="h-8 w-8" />}
            title="Visual Strategy Builder"
            description="Create complex trading strategies with our intuitive drag & drop interface. Combine technical indicators, price patterns, and custom conditions."
          />
          <FeatureCard
            icon={<BarChart2 className="h-8 w-8" />}
            title="Real-Time Backtesting"
            description="Test your strategies against historical market data to see how they would have performed. Analyze key metrics and optimize for better results."
            highlighted={true}
          />
          <FeatureCard
            icon={<Zap className="h-8 w-8" />}
            title="Automated Execution"
            description="Connect with popular brokers to automatically execute your strategies in real time. Set risk parameters and let the system trade for you."
          />
        </div>

        <div className="mt-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              How it works
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Our three-step process makes algorithmic trading accessible for everyone.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-1/2 left-1/4 right-1/4 h-0.5 bg-border -z-10"></div>
            
            <div className="flex flex-col items-center text-center space-y-4 opacity-0 animate-fade-in-up">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                1
              </div>
              <h3 className="text-xl font-semibold">Build</h3>
              <p className="text-muted-foreground">
                Create your strategy using our visual editor. Choose from over 100+ technical indicators and conditions.
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4 opacity-0 animate-fade-in-up animation-delay-200">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                2
              </div>
              <h3 className="text-xl font-semibold">Backtest</h3>
              <p className="text-muted-foreground">
                Test against historical data to validate performance. Analyze metrics and optimize your strategy.
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-4 opacity-0 animate-fade-in-up animation-delay-400">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                3
              </div>
              <h3 className="text-xl font-semibold">Deploy</h3>
              <p className="text-muted-foreground">
                Connect with your broker and deploy your strategy to the live market with just a few clicks.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="absolute top-1/3 -left-36 w-72 h-72 bg-primary/5 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-1/3 -right-36 w-72 h-72 bg-primary/5 rounded-full blur-3xl -z-10"></div>
    </section>
  );
}

function FeatureCard({ icon, title, description, highlighted = false }) {
  return (
    <Card className={`overflow-hidden transition-all duration-300 hover:shadow-lg ${highlighted ? 'border-primary/20' : ''}`}>
      <CardHeader className="pb-2">
        <div className="mb-4 p-2 w-14 h-14 rounded-lg flex items-center justify-center bg-primary/5">
          {icon}
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-base">{description}</CardDescription>
        <div className="mt-4 inline-flex items-center text-primary font-medium text-sm">
          Learn more <ArrowRight className="ml-1 h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
