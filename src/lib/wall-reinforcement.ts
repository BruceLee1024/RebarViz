import type { ShearWallParams } from './types';
import { parseSlabRebar } from './rebar';
import { wallOpening } from './quantity-geometry';

/** Wall distributed bar segments after cutting the opening; coordinates and lengths in m. */
export function wallDistributedReinforcement(params:ShearWallParams) {
  const S=.001,LW=params.lw*S,HW=params.hw*S,BW=params.bw*S,COVER=(params.cover||20)*S,BL=(params.boundaryLength||Math.max(params.bw,400))*S;
  const vert=parseSlabRebar(params.vertBar),horiz=parseSlabRebar(params.horizBar);
  const horizontalOffset=BW/2-COVER-horiz.diameter*S/2,verticalOffset=horizontalOffset-(horiz.diameter+vert.diameter)*S/2;
  const hole=wallOpening(params)[0];
  const openingBox=hole?{w:hole.x1-hole.x0,h:hole.y1-hole.y0,bottom:hole.y0,cx:(hole.x0+hole.x1)/2}:null;
  const openingLeft=openingBox?(openingBox.cx-openingBox.w/2)*S:0,openingRight=openingBox?(openingBox.cx+openingBox.w/2)*S:0;
  const openingBottomY=openingBox?openingBox.bottom*S:0,openingTopY=openingBox?openingBottomY+openingBox.h*S:0;
  const vertBars = (() => {
    const positions: { x: number; z: number; yCenter: number; height: number }[] = [];
    const wallInnerL = LW - 2 * BL; // middle zone only
    const startX = -LW / 2 + BL;
    const count = Math.max(Math.floor(wallInnerL / (vert.spacing * S)), 1);
    const spacing = wallInnerL / Math.max(count, 1);
    for (let i = 0; i <= count; i++) {
      const x = startX + i * spacing;
      const faces = [verticalOffset, -verticalOffset];
      for (const z of faces) {
        if (openingBox && x >= openingLeft && x <= openingRight) {
          if (openingBottomY > 0.02) positions.push({ x, z, yCenter: openingBottomY / 2, height: openingBottomY });
          if (openingTopY < HW - 0.02) positions.push({ x, z, yCenter: (openingTopY + HW) / 2, height: HW - openingTopY });
        } else {
          positions.push({ x, z, yCenter: HW / 2, height: HW });
        }
      }
    }
    return positions;
  })();
  const horizBars = (() => {
    const bars: { xCenter: number; y: number; z: number; length: number }[] = [];
    const spacing = horiz.spacing * S;
    for (let y = spacing; y < HW - 0.05; y += spacing) {
      for (const z of [horizontalOffset, -horizontalOffset]) {
        if (openingBox && y >= openingBottomY && y <= openingTopY) {
          const leftLen = Math.max(openingLeft + LW / 2, 0);
          const rightLen = Math.max(LW / 2 - openingRight, 0);
          if (leftLen > 0.02) bars.push({ xCenter: -LW / 2 + leftLen / 2, y, z, length: leftLen });
          if (rightLen > 0.02) bars.push({ xCenter: openingRight + rightLen / 2, y, z, length: rightLen });
        } else {
          bars.push({ xCenter: 0, y, z, length: LW });
        }
      }
    }
    return bars;
  })();
  return {vertBars,horizBars};
}
