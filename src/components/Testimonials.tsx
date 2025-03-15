
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";

export function Testimonials() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-primary mb-2 tracking-wide uppercase">Testimonials</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Loved by traders worldwide
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            See what our users have to say about their experience with our platform.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <TestimonialCard 
            content="The visual strategy builder is incredibly intuitive. I was able to create and backtest a complex strategy in just 30 minutes that would have taken days to code."
            name="Sarah Chen"
            role="Day Trader"
            avatarSrc="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&auto=format&fit=crop&q=80"
            initials="SC"
          />
          
          <TestimonialCard 
            content="The backtesting feature is a game-changer. Being able to see how my strategies would have performed historically gives me the confidence to trade with real money."
            name="Michael Rodriguez"
            role="Swing Trader"
            avatarSrc="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&auto=format&fit=crop&q=80"
            initials="MR"
          />
          
          <TestimonialCard 
            content="I've tried many trading platforms, but this one stands out with its clean design and powerful capabilities. The automated execution is flawless and saves me hours each day."
            name="Priya Patel"
            role="Algorithmic Trader"
            avatarSrc="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&auto=format&fit=crop&q=80"
            initials="PP"
          />
        </div>
      </div>
    </section>
  );
}

interface TestimonialCardProps {
  content: string;
  name: string;
  role: string;
  avatarSrc: string;
  initials: string;
}

function TestimonialCard({ content, name, role, avatarSrc, initials }: TestimonialCardProps) {
  return (
    <Card className="backdrop-blur-sm bg-card/50 overflow-hidden opacity-0 animate-fade-in-up">
      <CardContent className="p-6">
        <blockquote className="text-lg mb-6">"{content}"</blockquote>
        <div className="flex items-center">
          <Avatar className="h-10 w-10 mr-3">
            <AvatarImage src={avatarSrc} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{name}</p>
            <p className="text-muted-foreground text-xs">{role}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
