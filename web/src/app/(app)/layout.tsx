import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { DataWarmup } from "@/components/DataWarmup";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DataWarmup />
      <AppHeader />
      <main className="w-full px-4 pt-3 pb-10 sm:px-6 lg:px-8">{children}</main>
    </>
  );
}
