import { AppShell } from '@/components/AppShell';

export default function ColumnLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
