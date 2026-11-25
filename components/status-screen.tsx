import type { LucideIcon } from "lucide-react";

export function StatusScreen({
  icon: Icon,
  code,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  code?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="bg-brand-gradient mb-6 flex size-16 items-center justify-center rounded-2xl text-white shadow-lg shadow-primary/30">
        <Icon className="size-7" />
      </div>
      {code && <p className="text-primary mb-2 font-mono text-sm font-semibold tracking-widest">{code}</p>}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 max-w-md">{description}</p>
      {children && <div className="mt-6 flex gap-2">{children}</div>}
    </div>
  );
}
