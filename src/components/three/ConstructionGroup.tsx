'use client';

import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Material, MathUtils, Mesh, LineSegments } from 'three';

type MaterialState = { opacity: number; transparent: boolean; depthWrite: boolean; applied: number };

function applyFade(material: Material, base: MaterialState, factor: number) {
  if (Math.abs(material.opacity - base.applied) > .00001) base.opacity = material.opacity;
  material.opacity = base.opacity * factor;
  base.applied = material.opacity;
  const transparent = base.transparent || factor < 1;
  if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
  material.depthWrite = factor < 1 ? false : base.depthWrite;
}

/** Fade the actual steel in place; never stretch bars or move their hooks. */
export function ConstructionGroup({ children, visible, dim = false, enabled, reference = false, position }: {
  children: ReactNode; visible: boolean; dim?: boolean; enabled: boolean;
  reference?: boolean; position?: [number, number, number];
}) {
  const group = useRef<Group>(null);
  const alpha = useRef(1);
  const materials = useRef<{ material: Material; line: boolean; base: MaterialState }[]>([]);
  const originals = useRef(new WeakMap<Material, MaterialState>());
  const reducedMotion = useRef(false);

  useLayoutEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = query.matches;
    const update = () => { reducedMotion.current = query.matches; };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Refresh only on React commits, not by traversing the scene each frame.
  useLayoutEffect(() => {
    const next: typeof materials.current = [];
    group.current?.traverse(object => {
      if (!(object instanceof Mesh) && !(object instanceof LineSegments)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        let base = originals.current.get(material);
        if (!base) {
          base = { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, applied: material.opacity };
          originals.current.set(material, base);
        }
        next.push({ material, line: object instanceof LineSegments, base });
      }
    });
    materials.current = next;
  });

  useFrame((_, delta) => {
    if (!group.current) return;
    if (!enabled && alpha.current === 1) return;
    const target = visible ? (dim ? .28 : 1) : 0;
    alpha.current = !enabled || reducedMotion.current ? target : MathUtils.damp(alpha.current, target, 10, Math.min(delta, .05));
    if (Math.abs(alpha.current - target) < .001) alpha.current = target;
    group.current.visible = alpha.current > 0 || (enabled && reference);
    for (const [index, { material, line, base }] of materials.current.entries()) {
      // Respect opacity changes from hover/selection and the transparency slider.
      const delay = index / Math.max(1, materials.current.length) * .3;
      const reveal = enabled && visible && !dim && !reference && !reducedMotion.current
        ? MathUtils.clamp((alpha.current - delay) / (1 - delay), 0, 1) : alpha.current;
      const factor = enabled && reference && line ? Math.max(.2, reveal) : reveal;
      applyFade(material, base, factor);
    }
  });

  return <group ref={group} position={position}>{children}</group>;
}
