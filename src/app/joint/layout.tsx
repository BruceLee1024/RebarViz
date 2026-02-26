import { AppShell } from '@/components/AppShell';

export default function JointLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
