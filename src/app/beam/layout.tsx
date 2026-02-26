import { AppShell } from '@/components/AppShell';

export default function BeamLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
