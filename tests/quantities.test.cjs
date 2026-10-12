const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'rebar-quantities-'));
fs.symlinkSync(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');
after(()=>fs.rmSync(dir,{recursive:true,force:true}));
execFileSync(process.execPath,[require.resolve('typescript/bin/tsc'),'src/lib/calc-concrete.ts','src/lib/quantity-geometry.ts','src/lib/calc-formwork.ts','src/lib/compliance.ts','src/lib/beam-workspace.ts','--outDir',dir,'--module','commonjs','--target','es2020','--esModuleInterop','--skipLibCheck'],{cwd:root});
const c=require(path.join(dir,'calc-concrete.js')),g=require(path.join(dir,'quantity-geometry.js')),p=require(path.join(dir,'rebar.js'));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('orthogonal union removes internal faces and duplicate volume',()=>{
 const m=g.measureSolid([g.centeredBox(2000,1000,1000),g.centeredBox(1000,1000,2000)]);
 near(m.volume,3);near(m.sides,8);near(m.bottom,3);
});
test('multi-span beams use each clear span height and exclude column joints',()=>{
 near(c.calcBeamConcrete({...p.BEAM_PRESETS.standard,spanCount:2,spanWidths:[300,400],spanHeights:[500,700],spanLengths:[4000,5000],haunchType:'none'}).totalVolume,2);
});
test('concealed boundary does not add concrete; wall openings remove volume',()=>{
 const wall={...p.SHEAR_WALL_PRESETS.standard,lw:4000,hw:3000,bw:200,boundaryForm:'concealed',hasOpening:true,openingWidth:1000,openingHeight:2000,openingBottom:0};
 near(c.calcShearWallConcrete(wall).totalVolume,2);
});
test('tapered rectangular foundation integrates changing width and depth',()=>{
 near(c.calcFoundationConcrete({...p.FOUNDATION_PRESETS.standard,shape:'tapered',bx:2000,by:2000,colBx:1000,colBy:1000,h:1000,hasFoundationBeam:false}).totalVolume,7/3);
});
test('raft concrete deducts beam/slab and crossing beam overlap',()=>{
 const raft={...p.RAFT_PRESETS.standard,lx:4000,ly:4000,h:500,raftType:'beamSlab',beamB:500,beamH:1000,beamPosition:'low',colCountX:1,colCountY:1,colSpacingX:3000,colSpacingY:3000};
 near(c.calcRaftConcrete(raft).totalVolume,9.875);
});

const f=require(path.join(dir,'calc-formwork.js')),rules=require(path.join(dir,'compliance.js'));
test('beam contact faces respond to slabs, ends and explicit deductions',()=>{
 const beam={...p.BEAM_PRESETS.standard,spanCount:1};
 near(f.calcFormwork('beam',beam).totalArea,6);
 near(f.calcFormwork('beam',beam,{beamSlabSides:2,beamSlabThickness:150}).totalArea,4.8);
 near(f.calcFormwork('beam',beam,{includeBeamEnds:true,deductionArea:1}).totalArea,5.36);
 near(f.calcFormwork('beam',beam,{deductionArea:999}).totalArea,0);
});
test('multi-span variable sections have their own formwork dimensions',()=>{
 const beam={...p.BEAM_PRESETS.standard,spanCount:2,spanWidths:[300,400],spanHeights:[500,700],spanLengths:[4000,5000]};
 near(f.calcFormwork('beam',beam).totalArea,14.2);
});
test('horizontal and vertical haunches add different contact faces and volumes',()=>{
 const base={...p.BEAM_PRESETS.standard,haunchLength:800,haunchHeight:200,haunchSide:'both'};
 const slope=Math.hypot(800,200);
 near(f.calcFormwork('beam',{...base,haunchType:'vertical'}).totalArea,6+.32+2*.3*(slope-800)/1000);
 near(f.calcFormwork('beam',{...base,haunchType:'horizontal'}).totalArea,6+.32+2*1.2*(slope-800)/1000);
 near(c.calcBeamConcrete({...base,haunchType:'vertical'}).totalVolume,.72+.048);
 near(c.calcBeamConcrete({...base,haunchType:'horizontal'}).totalVolume,.72+.192);
});
test('wall door keeps its soffit even when the opening removes part of the wall bottom',()=>{
 const wall={...p.SHEAR_WALL_PRESETS.standard,lw:4000,hw:3000,bw:200,boundaryForm:'concealed',hasOpening:true,openingWidth:1000,openingHeight:2000,openingBottom:0};
 near(f.calcFormwork('shearwall',wall).totalArea,22.2);
 near(f.calcFormwork('shearwall',{...wall,openingWidth:500,openingHeight:600}).totalArea,25.2);
 near(g.wallOpening(wall)[0].y0,0);
});
test('foundation bottom and sloped faces are opt-in; stepped internal faces are excluded',()=>{
 const base={...p.FOUNDATION_PRESETS.standard,hasFoundationBeam:false,shape:'stepped',stepDims:[{bx:2000,by:2000,h:500},{bx:1000,by:1000,h:500}]};
 near(f.calcFormwork('foundation',base).totalArea,6);
 near(f.calcFormwork('foundation',base,{includeFoundationBottom:true}).totalArea,10);
 const taper={...base,shape:'tapered',bx:2000,by:2000,colBx:1000,colBy:1000,h:1000};
 near(f.calcFormwork('foundation',taper).totalArea,0);
 near(f.calcFormwork('foundation',taper,{includeSlopedFaces:true}).totalArea,6*Math.hypot(1,.5));
});
test('raft beam crossings do not add internal formwork surfaces',()=>{
 const raft={...p.RAFT_PRESETS.standard,lx:4000,ly:4000,h:500,raftType:'beamSlab',beamB:500,beamH:1000,beamPosition:'low',colCountX:1,colCountY:1,colSpacingX:3000,colSpacingY:3000};
 near(f.calcFormwork('raft',raft).totalArea,16);
});
test('wall ties share placements with model and leave openings clear',()=>{
 const wall={...p.SHEAR_WALL_PRESETS.standard,tieBar:'A6@400',hasOpening:true,openingWidth:1200,openingHeight:1800,openingBottom:0};
 const hole=g.wallOpening(wall)[0];
 assert.ok(g.wallTiePositions(wall).every(q=>q.x<hole.x0-6||q.x>hole.x1+6||q.y>hole.y1+120));
 assert.ok(g.wallTiePositions(wall).length<g.wallTiePositions({...wall,hasOpening:false}).length);
});
test('every built-in construction preset has finite nonnegative formwork and a check result',()=>{
 const sets={beam:p.BEAM_PRESETS,column:p.COLUMN_PRESETS,slab:p.SLAB_PRESETS,shearwall:p.SHEAR_WALL_PRESETS,joint:p.JOINT_PRESETS,stair:p.STAIR_PRESETS,foundation:p.FOUNDATION_PRESETS,stripfoundation:p.STRIPFOUNDATION_PRESETS,pilecap:p.PILECAP_PRESETS,raft:p.RAFT_PRESETS};
 for(const [type,presets] of Object.entries(sets)) for(const [name,params] of Object.entries(presets)) {
  const result=f.calcFormwork(type,params);
  assert.ok(Number.isFinite(result.totalArea)&&result.totalArea>=0,`${type}/${name}`);
  if(!['joint','foundation'].includes(type)) assert.ok(result.totalArea>0,`${type}/${name} empty`);
  assert.ok(rules.checkCompliance(type,params).length>0,`${type}/${name} checks`);
 }
 assert.ok(rules.checkCompliance('joint',p.JOINT_PRESETS.side).some(x=>x.status==='warn'));
});

test('foundation beam is included once with actual overhang length',()=>{
 const base={...p.FOUNDATION_PRESETS.standard,columnCount:2,colSpacing:2000,colBx:500,foundationBeamB:400,foundationBeamH:600,foundationBeamEndType:'bothSides',foundationBeamOverhang:300};
 near(c.calcFoundationConcrete({...base,hasFoundationBeam:true}).totalVolume-c.calcFoundationConcrete({...base,hasFoundationBeam:false}).totalVolume,3.1*.4*.6);
});
test('incomplete variable-height beam model produces an explicit review warning',()=>{
 const checks=rules.checkCompliance('beam',{...p.BEAM_PRESETS.standard,spanCount:2,spanHeights:[500,700]});
 assert.ok(checks.some(x=>x.field==='spanHeights'&&x.status==='warn'));
});
test('wall ties use the same 135 degree hook developed length as the model',()=>{
 const calc=require(path.join(dir,'calc.js')),shape=require(path.join(dir,'rebar-shapes.js'));
 const wall={...p.SHEAR_WALL_PRESETS.standard,hasOpening:false,tieBar:'A6@400'};
 const h=p.parseSlabRebar(wall.horizBar),t=p.parseSlabRebar(wall.tieBar);
 const expected=shape.createTieBarShapeSpec({sideOffsetMm:wall.bw/2-wall.cover-h.diameter/2,tieDiameterMm:t.diameter,sideBarDiameterMm:h.diameter});
 const item=calc.calcShearWall(wall).items.find(x=>x.name==='拉结筋');
 near(item.lengthM,expected.lengthMm/1000);assert.equal(item.count,g.wallTiePositions(wall).length);
});

test('beam erection quantities convert millimetres to metres for single and unequal spans',()=>{
 const calc=require(path.join(dir,'calc.js'));
 const cases=[
  [{...p.BEAM_PRESETS.standard},1.632,2,.617],
  [{...p.BEAM_PRESETS.complex},2.3,2,.888],
  [{...p.BEAM_PRESETS.simple,erectionBar:'3C12',spanCount:2,spanLengths:[4000,6000]},5,6,.888],
 ];
 for(const [params,length,count,unitWeight] of cases){
  const result=calc.calcBeam(params),item=result.items.find(x=>x.name==='架立筋');
  assert.ok(item);near(item.lengthM,length);assert.equal(item.count,count);
  near(item.weightKg,count*length*unitWeight);
  assert.ok(item.formulaSteps.some(x=>x.formula.includes('/ 1000')));
  near(Number.parseFloat(result.total),Number(result.items.reduce((sum,x)=>sum+x.weightKg,0).toFixed(2)));
 }
});

const workspace=require(path.join(dir,'beam-workspace.js'));
test('beam family routing preserves each supported foundation context',()=>{
 for(const system of ['strip','isolated','raft']) {
  const url=new URL(workspace.beamWorkspaceHref('foundation',system),'https://example.test');
  assert.equal(workspace.resolveBeamWorkspace(url.searchParams.get('kind'),url.searchParams.get('system')).key,`foundation:${system}`);
 }
 assert.equal(workspace.resolveBeamWorkspace('secondary','raft').key,'secondary:strip');
 assert.equal(workspace.resolveBeamWorkspace('unknown','unknown').family,'frame');
});
test('beam entry defaults enable their actual beam assemblies',()=>{
 assert.equal(workspace.FOUNDATION_BEAM_DEFAULT.columnCount,2);
 assert.equal(workspace.FOUNDATION_BEAM_DEFAULT.hasFoundationBeam,true);
 assert.equal(workspace.STRIP_BEAM_DEFAULT.supportType,'beam');
 assert.equal(workspace.SECONDARY_BEAM_DEFAULT.hasJcl,true);
 assert.equal(workspace.SECONDARY_BEAM_DEFAULT.supportCount,2);
 assert.equal(workspace.RAFT_BEAM_DEFAULT.raftType,'beamSlab');
});
test('coupling beams never inherit a frame beam compliance pass',()=>{
 const checks=rules.checkCompliance('beam',workspace.COUPLING_DEFAULT);
 assert.equal(workspace.COUPLING_DEFAULT.beamKind,'coupling');
 assert.ok(checks.some(x=>x.rule==='连梁检查范围'&&x.status==='warn'));
 assert.ok(!checks.some(x=>x.status==='pass'));
});

test('slab, roof column and foundation clearance limitations reach the user-facing construction checks',()=>{
 assert.ok(rules.checkCompliance('slab',{...p.SLAB_PRESETS.standard,thickness:60,distribution:'A8@200'}).some(q=>q.status==='warn'&&q.message.includes('板厚不足')));
 assert.ok(rules.checkCompliance('column',{...p.COLUMN_PRESETS.standard,topNodeType:'edge'}).some(q=>q.message.includes('柱顶已按先竖向')));
 assert.ok(rules.checkCompliance('foundation',{...p.FOUNDATION_PRESETS.standard,h:200}).some(q=>q.message.includes('避让底部网片')));
 assert.ok(rules.checkCompliance('joint',{...p.JOINT_PRESETS.side,anchorType:'bent'}).some(q=>q.message.includes('独立深度')));
});

test('short column dense zones never count the same height twice',()=>{
 const calc=require(path.join(dir,'calc.js'));
 const col={...p.COLUMN_PRESETS.standard,height:600,b:600,h:600,stirrup:'A8@100/200(2)'};
 assert.equal(calc.calcColumn(col).items.find(x=>x.name==='箍筋').count,6);
});
test('raft overlapping column strips count each actual bar station once',()=>{
 const calc=require(path.join(dir,'calc.js'));
 const raft={...p.RAFT_PRESETS.standard,raftType:'flatPlate',lx:4000,ly:4000,colCountX:2,colCountY:2,colSpacingX:1000,colSpacingY:1000,colStripWidth:2000,colStripBarX:'C16@200',colStripBarY:'C16@200'};
 // Positions -1960,-1760,...,1840; union of two strips is [-1500,1500]: 15 stations.
 assert.equal(calc.calcRaft(raft).items.find(x=>x.name==='ZXB X向附加底筋').count,15);
 assert.equal(calc.calcRaft(raft).items.find(x=>x.name==='ZXB Y向附加底筋').count,15);
});
test('BT concrete counts the n-1 step triangles represented above the sloped slab',()=>{
 const stair={...p.STAIR_PRESETS.bt_standard};
 near(c.calcStairConcrete(stair).items.find(x=>x.name==='踏步').volume,(stair.stepCount-1)*.5*stair.stepWidth*stair.stepHeight*stair.flightWidth/1e9);
});

test('all built-in component steel presets retain metre lengths and consistent numeric totals',()=>{
 const calc=require(path.join(dir,'calc.js')),cr=require(path.join(dir,'construction-rules.js'));
 const families=[['BEAM_PRESETS','calcBeam'],['COLUMN_PRESETS','calcColumn'],['SLAB_PRESETS','calcSlab'],['SHEAR_WALL_PRESETS','calcShearWall'],['STAIR_PRESETS','calcStair'],['FOUNDATION_PRESETS','calcFoundation'],['STRIPFOUNDATION_PRESETS','calcStripFoundation'],['PILECAP_PRESETS','calcPileCap'],['RAFT_PRESETS','calcRaft']];
 for(const [presets,fn] of families)for(const [name,params] of Object.entries(p[presets])){
  const result=calc[fn](params),label=`${presets}.${name}`;
  assert.ok(result.items.length,label);
  for(const row of result.items){
   assert.ok(Number.isInteger(row.count)&&row.count>=0,`${label}/${row.name}: count`);
   assert.ok(Number.isFinite(row.lengthM)&&row.lengthM>=0&&row.lengthM<100,`${label}/${row.name}: metre range`);
   near(row.weightKg,row.count*row.lengthM*cr.rebarWeightPerM(row.diameter));
  }
  const sum=result.items.reduce((s,x)=>s+x.weightKg,0);
  assert.equal(Number.parseFloat(result.total),Number(sum.toFixed(2)),label);
  assert.equal(Number.parseFloat(result.totalWithWaste),Number((sum*(1+result.wasteRate)).toFixed(2)),label);
 }
});
test('variable column hoop quantities and bending schedule use the correct section at each height',()=>{
 const calc=require(path.join(dir,'calc.js'));
 const col={...p.COLUMN_PRESETS.standard,height:3000,b:600,h:600,hasVariableSection:true,upperB:300,upperH:400,variableStart:1500,stirrup:'A8@100/200(4)'};
 const hoops=calc.calcColumnBarShapes(col).filter(x=>x.shapeType==='stirrup');
 const item=calc.calcColumn(col).items.find(x=>x.name==='箍筋');
 assert.equal(hoops.reduce((sum,x)=>sum+x.count,0),item.count);
 near(hoops.reduce((sum,x)=>sum+x.count*x.totalLen/1000,0),item.count*item.lengthM);
 assert.ok(hoops.some(x=>x.name.startsWith('上段')&&x.width<=300-50-8));
});
test('simple slab scaling uses square metres for formwork and cubic metres for concrete',()=>{
 const slab={...p.SLAB_PRESETS.standard,spanX:2000,spanY:3000,thickness:100};
 near(c.calcSlabConcrete(slab).totalVolume,.6);near(f.calcFormwork('slab',slab).totalArea,6);
 const twice={...slab,spanX:4000,spanY:6000,thickness:200};
 near(c.calcSlabConcrete(twice).totalVolume,4.8);near(f.calcFormwork('slab',twice).totalArea,24);
});
test('strip bottom distribution excludes actual beam support strips',()=>{
 const calc=require(path.join(dir,'calc.js'));
 const strip={...p.STRIPFOUNDATION_PRESETS.doubleBeam,width:2000,length:4000,cover:40,distBar:'A8@200',supportWidth:400,supportSpacing:1000};
 // Ten equal-spaced positions from -960 to960; four fall inside two 400mm support strips.
 assert.equal(calc.calcStripFoundation(strip).items.find(x=>x.name==='底部分布筋').count,6);
});

test('strip local annotation replaces corresponding bars within its range instead of adding twice',()=>{
 const calc=require(path.join(dir,'calc.js'));
 const strip={...p.STRIPFOUNDATION_PRESETS.doubleBeam,length:4000,cover:40,bottomBar:'C16@200',topBar:'C12@200',hasLocalOverride:true,localOverrideStart:1000,localOverrideLength:1000,localBottomBar:'C18@100',localTopBar:'C16@100'};
 // Baseline 20 stations across [-1960,1960]; 5 lie in [-1000,0]. Replacement has 11 stations.
 const result=calc.calcStripFoundation(strip);
 assert.equal(result.items.find(x=>x.name==='底部横向受力筋').count,15);
 assert.equal(result.items.find(x=>x.name==='顶部横向受力筋').count,15);
 assert.equal(result.items.find(x=>x.name==='原位修正底筋').count,11);
 assert.equal(result.items.find(x=>x.name==='原位修正顶筋').count,11);
});

test('stair sloped slab quantities stop at the represented support beam faces',()=>{
 const base={...p.STAIR_PRESETS.standard,stepCount:10,stepWidth:400,stepHeight:300,slabThickness:100,flightWidth:1000,beamB:200,beamH:500,topPlatformLen:0,botPlatformLen:0};
 // 3:4:5 slope; AT removes two 400mm support projections, BT removes one 200mm projection.
 near(c.calcStairConcrete({...base,stairType:'AT'}).items.find(x=>x.name==='梯段斜板').volume,.4);
 near(c.calcStairConcrete({...base,stairType:'BT',botFlatLen:700}).items.find(x=>x.name==='梯段斜板').volume,.475);
 near(f.calcFormwork('stair',{...base,stairType:'AT'}).items.find(x=>x.name==='梯段底模').area,4);
 near(f.calcFormwork('stair',{...base,stairType:'BT',botFlatLen:700}).items.find(x=>x.name==='梯段底模').area,4.75);
});
