"use client";

import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Screen-only bar above a printable document. "Print" also offers Save as PDF in every browser. */
export function PrintToolbar() {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-6 py-3 backdrop-blur print:hidden">
      <Button variant="ghost" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())} className="text-zinc-600 hover:text-violet-700">
        <ArrowLeftIcon /> Back
      </Button>
      <p className="hidden text-sm text-zinc-500 sm:block">Use Print, then choose “Save as PDF” to keep a copy.</p>
      <Button onClick={() => window.print()} className="bg-violet-700 text-white hover:bg-violet-800">
        <PrinterIcon /> Print / PDF
      </Button>
    </div>
  );
}
