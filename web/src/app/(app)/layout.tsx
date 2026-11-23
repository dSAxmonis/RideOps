import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { DataWarmup } from "@/components/DataWarmup";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DataWarmup />
      <AppHeader />
      <main className="mx-auto max-w-[1440px] px-4 pt-3 pb-10 sm:px-8 lg:px-12">{children}</main>
    </>
  );
}
