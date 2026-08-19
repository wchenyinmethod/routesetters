/* The reach curve: from a hold, with feet on a foothold, how big a gap can the
 * free hand actually cover? Sweep gap size and direction. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT = path.join(__dirname, '..');
const s={};s.window=s;s.console=console;
s.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=v}};
s.document={createElement:()=>({getContext:()=>({})})};
const c=vm.createContext(s);
for(const f of ['util','physics','holds','climber','components','levels','party'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'src',f+'.js'),'utf8'),c,{filename:f+'.js'});
const RS=s.RS;
const F=1/120;

function attempt(gap, angDeg, withFeet, allowDyno){
  const ax=330, ay=-500;
  const a=angDeg*Math.PI/180;
  const bx=ax+Math.cos(a)*gap, by=ay+Math.sin(a)*gap;
  const holds=[['jug',ax,ay],['jug',Math.round(bx),Math.round(by)]];
  if(withFeet){ holds.push(['footchip',ax-8,ay+46]); holds.push(['footchip',ax+26,ay+50]); }
  const def={id:'t',name:'t',theme:'gym',height:900,par:60,
    bounds:{x:0,y:-940,w:660,h:1360},start:{x:330,y:-460},finish:{x:330,y:-880,r:38},
    terrain:[{type:'rect',x:-300,y:0,w:1260,h:420,mat:'rock'}],
    holds, zones:[], props:[]};
  const g={solver:new RS.Solver(),world:null,climber:null,runTime:0,shake(){},toast(){},sfx(){}};
  RS.buildWorld(g,def);
  const A=g.world.holds[0], B=g.world.holds[1];
  const cl=new RS.Climber(g,{x:ax,y:ay+26,profile:RS.PROFILES[0]});
  g.climber=cl;
  cl.handL.setPos(ax,ay,false);
  cl.latch(cl.limbs.handL,A);
  for(let i=0;i<3.0*120;i++){
    const t=i*F;
    let mx,my,jump=false;
    if(t<0.7){mx=A.x;my=A.y-110;}
    else {mx=B.x;my=B.y; if(allowDyno && Math.abs(t-0.75)<F) jump=true;}
    cl.update(F,{mx,my,left:true,right:t>0.7,jump},true);
    g.solver.step(F);
    RS.updateProps(g,F,g.solver.time);
    if(cl.limbs.handR.hold===B) return true;
  }
  return false;
}

const angles=[-90,-70,-110,-50,-130];   // straight up, and off to each side
console.log('\nReach curve: can the free hand cover a gap of N px? (feet on chips)\n');
console.log('  gap   up    up-R  up-L  diagR diagL   verdict');
for(let gap=20;gap<=80;gap+=5){
  const res=angles.map(A=>attempt(gap,A,true,false));
  const n=res.filter(Boolean).length;
  console.log('  '+String(gap).padStart(3)+'px  '+
    res.map(r=>(r?' ok  ':' --  ')).join('')+
    '  '+n+'/5'+(n>=4?'  <= comfortable':n>=2?'  (marginal)':'  unreachable'));
}
console.log('\nWith a dyno (space) on the same gaps, straight up:\n');
for(let gap=45;gap<=100;gap+=5){
  const r=attempt(gap,-90,true,true);
  console.log('  '+String(gap).padStart(3)+'px  '+(r?'ok':'--'));
}
