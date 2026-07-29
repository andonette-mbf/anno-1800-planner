import { AppShell } from "@/components/AppShell";
import { AppProviders } from "@/lib/store";

export default function Home() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
