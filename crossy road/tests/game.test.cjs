const fs=require('fs'),vm=require('vm'),assert=require('assert');
const elements=new Map(),saved={};
function el(id){if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,style:{},dataset:{},attributes:{},classList:{add(){},remove(){}},setAttribute(k,v){this.attributes[k]=v},addEventListener(){},focus(){}});return elements.get(id)}
class Renderer {resize(){}draw(){}}
const sandbox={console,Math,Map,parseInt,performance,BrickGrid:require('../brick-grid.js'),BrickRenderer:Renderer,document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},activeElement:null},window:{innerWidth:1280,innerHeight:800,addEventListener(){}},localStorage:{getItem:k=>saved[k],setItem:(k,v)=>saved[k]=v},matchMedia:()=>({matches:false}),requestAnimationFrame(){}};
let src=fs.readFileSync('game.js','utf8');
src=src.replace(/\}\)\(\);\s*$/, 'globalThis.test={start,hop,update,pause,reset,generate,resize,trainPosition,get state(){return state},get player(){return player},get lanes(){return lanes},get score(){return score},get best(){return best},get idle(){return idleTime},get cameraX(){return cameraX},setCameraX(v){cameraX=v},setClock(v){clock=v},setCamera(v){camera=v}};})();');
vm.runInNewContext(src,sandbox);const g=sandbox.test;let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name)}
function step(seconds){const n=Math.floor(seconds/.01);for(let i=0;i<n;i++)g.update(.01);const tail=seconds-n*.01;if(tail>1e-9)g.update(tail)}
function safe(){g.start();for(let y=-1;y<=2;y++)g.lanes.set(y,{y,type:'grass',trees:[],flowers:[],items:[],speed:0})}
check('timer starts at five seconds',()=>{safe();assert.equal(el('timer-value').textContent,'5.0');assert.equal(el('timer').hidden,false)});
check('alive immediately before five seconds',()=>{step(4.99);assert.equal(g.state,'playing');assert.equal(el('timer-value').textContent,'0.1')});
check('defeated at five seconds',()=>{g.update(.011);assert.equal(g.state,'dying');assert.equal(el('timer-value').textContent,'0.0');assert.equal(el('overlay-title').textContent,"TIME'S UP!")});
check('forward hop resets upon completion',()=>{safe();step(2);g.hop(0,1);assert(g.idle>=1.99);step(.16);assert.equal(g.player.y,1);assert.equal(el('timer-value').textContent,'5.0');assert.equal(g.score,1)});
check('sideways movement cannot reset timer',()=>{safe();step(2);g.hop(1,0);step(.17);assert(g.idle>2.15);assert.equal(g.player.facing,'up')});
check('backward movement cannot reset timer',()=>{safe();step(2);g.hop(0,-1);step(.17);assert(g.idle>2.15)});
check('returning to a reached row cannot reset the timer',()=>{
  safe();g.hop(0,1);step(.16);assert.equal(g.score,1);
  step(1);g.hop(0,-1);step(.16);const elapsedBeforeReturn=g.idle;
  g.hop(0,1);step(.16);
  assert.equal(g.score,1);assert(g.idle>elapsedBeforeReturn);assert(parseFloat(el('timer-value').textContent)<4);
});
check('grass chunks do not generate white flower spots',()=>{
  g.start();for(const lane of g.lanes.values())if(lane.type==='grass') {
    assert.equal(lane.flowers.length,0);for(const chunk of lane.chunks.values())assert.equal(chunk.flowers.length,0);
  }
});
check('blocked forward input cannot reset timer',()=>{safe();g.lanes.get(1).trees.push({x:0});step(3);g.hop(0,1);assert.equal(g.player.hop,null);assert(g.idle>2.99)});
check('log drift cannot reset timer',()=>{safe();g.lanes.set(0,{y:0,type:'water',trees:[],items:[{x:0,length:3.45}],speed:.1});step(3);assert(g.idle>2.99);assert(g.player.x>0)});
check('pause freezes countdown',()=>{safe();step(1);g.pause();const remaining=g.idle;g.update(.035,20);assert.equal(g.idle,remaining);assert.equal(g.state,'paused');g.pause();g.update(.1);assert(g.idle>remaining)});
check('long frames use elapsed time for deadline',()=>{safe();g.update(.035,4.5);assert.equal(el('timer-value').textContent,'0.5');g.update(.035,.5);assert.equal(g.state,'dying')});
check('last two seconds show urgent warning',()=>{safe();g.update(.035,3);assert.equal(el('timer').dataset.urgent,'true');assert.equal(el('timer-note').textContent,'HOP FORWARD NOW!')});
check('forward hop clears urgent warning',()=>{g.hop(0,1);step(.16);assert.equal(el('timer').dataset.urgent,'false');assert.equal(el('timer-value').textContent,'5.0')});
check('restart clears timer, score, and warning',()=>{safe();assert.equal(g.score,0);assert.equal(g.idle,0);assert.equal(el('timer').dataset.urgent,'false')});
check('cars still cause defeat',()=>{safe();g.lanes.set(0,{y:0,type:'road',trees:[],items:[{x:0,length:1.75}],speed:0});step(.01);assert.equal(g.state,'dying')});
check('water without log causes defeat',()=>{safe();g.lanes.set(0,{y:0,type:'water',trees:[],items:[],speed:0});step(.01);assert.equal(g.state,'dying')});
check('train collisions still work',()=>{safe();g.lanes.set(0,{y:0,type:'rail',trees:[],items:[],phase:25/34-.01,period:10,direction:1});step(.01);assert.equal(g.state,'dying')});
check('best score persists across runs',()=>{safe();assert(g.best>=1);assert(Number(saved['crossy-road-best'])>=1)});
check('world remains bounded',()=>{for(let row=0;row<1000;row+=5){g.setCamera(row);g.generate();assert(g.lanes.size<40)}});
check('all static page assets exist locally',()=>{const html=fs.readFileSync('index.html','utf8');for(const [,file] of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g))assert(fs.existsSync(file),file);assert(!/id="sound"|Sound \(M\)/.test(html))});

check('road vehicles are 15 percent faster',()=>{
  for(let run=0;run<20;run++){g.start();for(const lane of g.lanes.values())if(lane.type==='road'){
    const speed=Math.abs(lane.speed),difficulty=Math.min(lane.y/100,1.4);
    assert(speed>=1.4*1.15-1e-8);assert(speed<=(2.4+difficulty)*1.15+1e-8);
  }}
});
check('traffic is sparse and evenly spaced throughout the active area',()=>{
  for(let run=0;run<20;run++){g.start();for(const lane of g.lanes.values())if(lane.type==='road'){
    assert(lane.items.length>=3&&lane.items.length<=18);
    const xs=lane.items.map(i=>i.x).sort((a,b)=>a-b);
    const gaps=xs.slice(1).map((x,i)=>x-xs[i]);
    gaps.forEach(gap=>{assert(gap>=6.4-1e-8);assert(Math.abs(gap-lane.spacing)<1e-8)});
  }}
});
check('raft hitboxes match the standard brick grid',()=>{
  g.start();for(const lane of g.lanes.values())if(lane.type==='water')lane.items.forEach(i=>assert.equal(i.length,3.5));
});

check('ground landings snap to studs after drifting off-grid',()=>{
  safe();g.player.x=.38;g.hop(0,1);step(.16);assert.equal(g.player.x,.5);assert.equal(g.player.y,1);
});
check('left and right hops cross all previous borders',()=>{
  safe();for(let i=0;i<30;i++){g.hop(1,0);step(.16)}assert.equal(g.player.x,30);assert.equal(g.state,'playing');
  safe();for(let i=0;i<30;i++){g.hop(-1,0);step(.16)}assert.equal(g.player.x,-30);assert.equal(g.state,'playing');
});
check('sideways streaming covers distant positions without growing memory',()=>{
  g.start();
  for(const x of [128,-128,1024,-1024,8192,-8192]){
    g.player.x=x;g.setCameraX(x);g.generate();
    for(const l of g.lanes.values()){
      assert(l.left<x-10&&l.right>x+10);assert(l.chunks.size<=8);
      if(l.spacing){assert(l.items.length<=18);assert(l.items.some(i=>Math.abs(i.x-x)<=l.spacing));}
    }
  }
});
check('revisited terrain is deterministic',()=>{
  g.start();g.player.x=100;g.setCameraX(100);g.generate();
  const original=JSON.stringify(g.lanes.get(0).trees);
  g.player.x=-100;g.setCameraX(-100);g.generate();
  g.player.x=100;g.setCameraX(100);g.generate();
  assert.equal(JSON.stringify(g.lanes.get(0).trees),original);
});
check('raft landing follows a local stud and stands on top',()=>{
  safe();const raft={x:.31,length:3.5};
  g.lanes.set(1,{y:1,type:'water',trees:[],flowers:[],items:[raft],speed:1.4});
  g.hop(0,1);step(.16);
  assert.equal(g.state,'playing');assert.equal(g.player.raft,raft);assert.equal(g.player.z,.223);
  const local=g.player.x-raft.x;
  assert(Math.abs((local-.125)/.25-Math.round((local-.125)/.25))<1e-8);
  step(1);assert(Math.abs(g.player.x-raft.x-local)<1e-8);
});
check('side hop on a raft keeps an exact four-stud step',()=>{
  const before=g.player.localX;g.hop(1,0);step(.16);
  assert.equal(g.player.localX,before+1);assert.equal(g.player.z,.223);
});
check('raft carry has no horizontal death boundary',()=>{
  safe();g.player.x=100;
  const raft={x:100,length:3.5};g.lanes.set(0,{y:0,type:'water',trees:[],items:[raft],speed:1});
  step(1);assert.equal(g.state,'playing');assert(g.player.x>100);
});
check('train hazards extend to distant horizontal positions',()=>{
  safe();g.player.x=1000;
  const lane={y:0,type:'rail',trees:[],items:[],phase:0,period:10,direction:1};
  const phase=((1000+25)/34)%10;lane.phase=phase-.01;
  g.lanes.set(0,lane);step(.01);assert.equal(g.state,'dying');
});
console.log(count+' gameplay and delivery checks passed.');


