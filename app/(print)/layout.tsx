import { PrintToolbar } from "@/components/print/print-toolbar";

// Printable documents: no app chrome, always black on white, sized for A4/Letter.
export const instant = false;

export default function PrintLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-svh bg-zinc-100 text-zinc-900 print:bg-white">
      <PrintToolbar />
      <main className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {children}
      </main>
    </div>
  );
}
