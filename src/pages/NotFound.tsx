
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted">
          <span className="text-2xl font-bold">404</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Page not found</h1>
        <p className="text-muted-foreground mb-6">
          Sorry, we couldn't find the page you're looking for. It might have been moved or doesn't exist.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg" className="rounded-full">
            <a href="/">Go back home</a>
          </Button>
          <Button variant="outline" size="lg" className="rounded-full">
            <a href="#contact">Contact support</a>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
