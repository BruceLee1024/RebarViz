import type { SectionScene, SectionPoint } from './section-scene';
const palette:Record<string,string>={'#C0392B':'#f87171','#E67E22':'#fbbf77','#2980B9':'#6ab7f6','#8E44AD':'#c4b5fd','#27AE60':'#61dbaa','#7D3C98':'#c4b5fd','#1ABC9C':'#52d4c8','#16A085':'#5eead4','#229954':'#61dbaa'};
export const sectionColor=(color:string)=>palette[color.toUpperCase()]||color;
export function renderSection(ctx:CanvasRenderingContext2D,s:SectionScene,w:number,h:number,zoom=1,pan:[number,number]=[0,0]) {
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#071a29';ctx.fillRect(0,0,w,h);
  const points:SectionPoint[]=[...s.paths.flatMap(q=>q.points),...s.dots.map(q=>q.point)];
  const x0=Math.min(-s.width/2,...points.map(q=>q[0])),x1=Math.max(s.width/2,...points.map(q=>q[0]));
  const minY=s.yDown?-s.height/2:0,maxY=s.yDown?s.height/2:s.height;
  const y0=Math.min(minY,...points.map(q=>q[1])),y1=Math.max(maxY,...points.map(q=>q[1]));
  const scale=Math.min((w-84)/Math.max(x1-x0,1),(h-72)/Math.max(y1-y0,1))*zoom;
  const centerX=(x0+x1)/2,centerY=(y0+y1)/2;
  const pos=(p:SectionPoint):SectionPoint=>[w/2+12+(p[0]-centerX)*scale+pan[0],h/2-4+(p[1]-centerY)*scale*(s.yDown?1:-1)+pan[1]];
  for(const path of s.paths){ctx.beginPath();path.points.forEach((q,i)=>{const [x,y]=pos(q);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
    if(path.fill){ctx.fillStyle=path.fill;ctx.fill();}
    ctx.strokeStyle=sectionColor(path.color);ctx.lineWidth=path.diameter?Math.max(.65,Math.min(path.diameter*scale,2.5)):1;ctx.setLineDash(path.dash?[4,3]:[]);ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    if(path.label){const xs=path.points.map(q=>q[0]),ys=path.points.map(q=>q[1]),[x,y]=pos([(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2]);ctx.fillStyle='#b6cedc';ctx.font='10px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(path.label,x,y+3);}
  }
  ctx.setLineDash([]);
  for(const dot of s.dots){const [x,y]=pos(dot.point);ctx.beginPath();ctx.arc(x,y,Math.max(1.3,dot.diameter*scale/2),0,Math.PI*2);ctx.fillStyle=sectionColor(dot.color);ctx.fill();ctx.strokeStyle='#071a29';ctx.lineWidth=.6;ctx.stroke();}
  const dim=(a:SectionPoint,b:SectionPoint,text:string,vertical=false)=>{ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle='#759bb3';ctx.lineWidth=.8;ctx.stroke();
    for(const [x,y] of [a,b]){ctx.beginPath();ctx.moveTo(x-3,y+3);ctx.lineTo(x+3,y-3);ctx.stroke();}
    ctx.font='11px system-ui,sans-serif';ctx.textAlign='center';ctx.fillStyle='#b8d1df';ctx.save();const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;if(vertical){ctx.translate(x-7,y);ctx.rotate(-Math.PI/2);ctx.fillText(text,0,0);}else ctx.fillText(text,x,y+14);ctx.restore();};
  const [left,top]=pos([-s.width/2,maxY]),[right,bottom]=pos([s.width/2,minY]);
  const topPx=Math.min(top,bottom),bottomPx=Math.max(top,bottom);
  dim([left,bottomPx+14],[right,bottomPx+14],`${s.width}`);
  dim([left-15,topPx],[left-15,bottomPx],`${s.height}`,true);
  ctx.fillStyle='#7fa8bc';ctx.font='10px system-ui,sans-serif';ctx.textAlign='left';ctx.fillText(s.kind==='plan'?'X →  Y ↓  · mm':'截面尺寸 · mm',10,15);
  if(s.cover!=null){ctx.textAlign='right';ctx.fillText(`c = ${s.cover} mm`,w-10,15);}
  if(s.kind==='section')ctx.fillText('点 / 线按剖切方向区分',w-10,h-8);
}
export function exportSectionImage(s:SectionScene,filename:string) {
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=Math.max(800,120+s.legend.length*56+s.notes.length*18);
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.fillStyle='#071a29';ctx.fillRect(0,0,1200,canvas.height);
  ctx.save();ctx.translate(0,56);renderSection(ctx,s,800,canvas.height-120);ctx.restore();
  ctx.fillStyle='#d6ebf5';ctx.font='600 22px system-ui,sans-serif';ctx.fillText(s.title,26,33);ctx.font='13px system-ui,sans-serif';ctx.fillStyle='#92b6ca';ctx.fillText(s.subtitle,440,33);
  let y=92;for(const item of s.legend){ctx.fillStyle=sectionColor(item.color);ctx.fillRect(828,y-10,6,6);ctx.fillStyle='#cce3ef';ctx.font='14px system-ui,sans-serif';ctx.fillText(item.name,848,y);ctx.fillStyle='#91b6cc';ctx.font='13px system-ui,sans-serif';ctx.fillText(item.spec+(item.count!=null?` · ${item.count}${item.unit||'根'}`:''),848,y+20);y+=56;}
  ctx.fillStyle='#91b6cc';ctx.font='12px system-ui,sans-serif';ctx.textAlign='left';s.notes.forEach((note,i)=>ctx.fillText(note,26,canvas.height-s.notes.length*18+ i*18-10,1140));
  const a=document.createElement('a');a.download=filename;a.href=canvas.toDataURL('image/png');document.body.appendChild(a);a.click();a.remove();
}
