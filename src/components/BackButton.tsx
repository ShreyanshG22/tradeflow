
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface BackButtonProps {
  to: string;
  className?: string;
}

export function BackButton({ to, className = "" }: BackButtonProps) {
  return (
    <Link to={to} className={className}>
      <Button variant="outline" size="icon" className="rounded-full">
        <ArrowLeft size={18} />
        <span className="sr-only">Back</span>
      </Button>
    </Link>
  );
}
