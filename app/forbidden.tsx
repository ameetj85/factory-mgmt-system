import Link from "next/link";
import { ShieldXIcon } from "lucide-react";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <StatusScreen
      icon={ShieldXIcon}
      code="403"
      title="You don't have access to this page"
      description="Your role doesn't include permission for this area. Ask an administrator if you think that's a mistake."
    >
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </StatusScreen>
  );
}
