import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StatusScreen
      icon={SearchXIcon}
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
    >
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </StatusScreen>
  );
}
