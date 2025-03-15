
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

export function Pricing() {
  return (
    <section id="pricing" className="py-20">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-primary mb-2 tracking-wide uppercase">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            Choose the plan that's right for you. All plans include a 7-day free trial.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <PricingCard 
            title="Basic"
            price="$29"
            description="Perfect for beginners and casual traders."
            features={[
              "Visual Strategy Builder",
              "Basic Technical Indicators",
              "Limited Backtesting",
              "Market Data for 1 Year",
              "Manual Trade Execution"
            ]}
            buttonText="Get Started"
            variant="outline"
          />
          
          <PricingCard 
            title="Pro"
            price="$79"
            description="For serious traders looking to automate."
            features={[
              "Everything in Basic",
              "Advanced Technical Indicators",
              "Unlimited Backtesting",
              "Market Data for 5 Years",
              "Automated Trade Execution",
              "Priority Support"
            ]}
            buttonText="Get Started"
            variant="default"
            highlighted={true}
          />
          
          <PricingCard 
            title="Enterprise"
            price="Custom"
            description="For professional trading firms and institutions."
            features={[
              "Everything in Pro",
              "Custom Indicators",
              "API Access",
              "Dedicated Account Manager",
              "Multiple User Accounts",
              "White-label Options"
            ]}
            buttonText="Contact Sales"
            variant="outline"
          />
        </div>
      </div>
    </section>
  );
}

interface PricingCardProps {
  title: string;
  price: string;
  description: string;
  features: string[];
  buttonText: string;
  variant: "default" | "outline";
  highlighted?: boolean;
}

function PricingCard({ title, price, description, features, buttonText, variant, highlighted = false }: PricingCardProps) {
  return (
    <Card className={`flex flex-col h-full opacity-0 animate-fade-in-up ${highlighted ? 'border-primary/30 shadow-lg relative overflow-hidden' : ''}`}>
      {highlighted && (
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground text-xs font-medium py-1 px-3 rounded-full">
          Most Popular
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <div className="mt-3">
          <span className="text-4xl font-bold">{price}</span>
          {price !== "Custom" && <span className="text-muted-foreground ml-1">/month</span>}
        </div>
        <CardDescription className="mt-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <ul className="space-y-3">
          {features.map((feature, i) => (
            <li key={i} className="flex items-start">
              <Check className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button className="w-full" variant={variant}>
          {buttonText}
        </Button>
      </CardFooter>
    </Card>
  );
}
