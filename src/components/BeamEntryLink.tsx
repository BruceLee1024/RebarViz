'use client';
import Link from 'next/link';
import { Columns3 } from 'lucide-react';
import { beamWorkspaceHref, type BeamFamily, type FoundationContext } from '@/lib/beam-workspace';

/** Keep the current assembly when opening its beams from an existing foundation page. */
export function BeamEntryLink({ params, system, family = 'foundation' }: { params: object; system: FoundationContext; family?: BeamFamily }) {
  const href = `${beamWorkspaceHref(family, system)}&p=${encodeURIComponent(btoa(encodeURIComponent(JSON.stringify(params))))}`;
  return <Link className="rv-button" href={href}><Columns3 size={15} /><span>在梁工作台打开</span></Link>;
}
