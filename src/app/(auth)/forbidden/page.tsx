import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldOff } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <EmptyState
      icon={ShieldOff}
      title="Not allowed"
      hint="Your role doesn’t have access to that page."
      action={
        <Button href="/" variant="secondary">
          Back home
        </Button>
      }
    />
  );
}
