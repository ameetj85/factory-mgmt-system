import { BoxesIcon, ClipboardCheckIcon, FactoryIcon, GaugeIcon, WrenchIcon } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

const HIGHLIGHTS = [
  { icon: BoxesIcon, title: "Inventory you can trust", text: "Every movement recorded on an immutable stock ledger." },
  { icon: GaugeIcon, title: "Live production tracking", text: "Work orders, output and scrap straight from the floor." },
  { icon: WrenchIcon, title: "Equipment uptime", text: "Downtime reasons, OEE and preventive maintenance." },
  { icon: ClipboardCheckIcon, title: "Quality and traceability", text: "Inspections and lot tracing from supplier to customer." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh flex-1 lg:grid-cols-[1.05fr_1fr]">
      <aside className="bg-brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-fuchsia-400/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <FactoryIcon className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Factory Management System</span>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl leading-tight font-semibold tracking-tight">
              Run the whole plant from one place.
            </h2>
            <p className="text-lg text-white/75">
              Plan production, track the shop floor and keep materials, machines and quality in check.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="rounded-xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/15"
              >
                <Icon className="mb-2 size-5 text-fuchsia-200" />
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-sm text-white/70">{text}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">Secure sign-in · Role-based access · Full audit trail</p>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-6 py-12">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <BrandMark />
          <span className="text-lg font-semibold tracking-tight">Factory Management System</span>
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
