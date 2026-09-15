/* Crossy Road gameplay. Rendering lives in brick-renderer.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  let renderer;
  try { renderer=new BrickRenderer(canvas); }
  catch(error) {
    $('render-error').hidden=false;$('start').disabled=true;
    console.error('Unable to initialize the 3D renderer:',error);return;
  }
  const GRID=BrickGrid, CHUNK_WIDTH=8, HOP_TIME=.16, FORWARD_LIMIT=5;
  const TRAFFIC_SPEED = 1.15, TRAFFIC_SPACING = 1.2;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width, height, camera = 0, cameraX = 0;
  let state = 'welcome', lanes = new Map(), player, score = 0, best = 0, oldBest = 0;
  let clock = 0, lastTime = 0, idleTime = 0, deathTime = 0, toastTime = 0;
  let nextRow = -8, queue = null, particles = [], shake = 0;
  let pointer = null;
  try { best = Math.max(0, parseInt(localStorage.getItem('crossy-road-best'), 10) || 0); } catch (_) {}
  $('best').textContent = best;
  const random = (a,b) => a + Math.random() * (b-a);
  const choose = a => a[Math.floor(Math.random()*a.length)];
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const mod = (n,m) => ((n % m)+m)%m;
  function notify(message) {
    $('toast').textContent = message; $('toast').classList.add('show'); toastTime=2.7;
  }
  let timerTenth=-1, timerWarning=false;
  function updateTimer() {
    const remaining=Math.max(0,FORWARD_LIMIT-idleTime);
    const tenth=Math.ceil(remaining*10-1e-8);
    if(tenth!==timerTenth) {
      $('timer-value').textContent=(tenth/10).toFixed(1);
      $('timer-meter').setAttribute('aria-valuenow',(tenth/10).toFixed(1));
      timerTenth=tenth;
    }
    $('timer-fill').style.transform='scaleX('+(remaining/FORWARD_LIMIT)+')';
    $('timer').dataset.urgent=remaining<=2?'true':'false';
    $('timer-note').textContent=remaining<=2?'HOP FORWARD NOW!':'New distance resets the clock';
    if(remaining<=2&&!timerWarning&&state==='playing') {
      timerWarning=true;notify('2 SECONDS LEFT — HOP FORWARD!');
    }
  }
  function makeLane(y) {
    let type = 'grass';
    if (y > 2) {
      const previous = lanes.get(y-1);
      const roll = Math.random();
      type = roll < .49 ? 'road' : roll < .70 ? 'grass' : roll < .91 ? 'water' : 'rail';
      if (y < 7) type = y === 6 ? 'grass' : 'road';
      if (y === 8 || y === 9) type = 'water';
      if (y === 10) type = 'grass';
      if (y === 12) type = 'rail';
      // Banks separate different hazards; short groups always have a safe rest.
      if (previous && previous.type !== 'grass' && previous.type !== type) type='grass';
      if ([1,2,3].every(n => lanes.get(y-n)?.type !== 'grass')) type='grass';
    }
    const direction = Math.random() < .5 ? -1 : 1;
    const difficulty = Math.min(y/100,1.4);
    const lane={y,type,direction,speed:0,items:[],trees:[],flowers:[],phase:random(0,9),period:random(9,13),
      seed:Math.floor(random(0,4294967296)),streamed:true,chunks:new Map(),itemMap:new Map()};
    if(type==='road') {
      lane.speed=direction*random(1.4,2.4+difficulty)*TRAFFIC_SPEED;
      const count=Math.max(3,Math.floor(32/(random(5.2,7.5)*TRAFFIC_SPACING)));
      lane.spacing=32/count;lane.offset=random(0,lane.spacing);
    }
    if(type==='water') {
      lane.speed=direction*random(.8,1.4);
      lane.spacing=5.2;lane.offset=random(0,lane.spacing);
    }
    lanes.set(y,lane);
  }
  // Coordinate-based variation lets revisited scenery stay the same without
  // storing an infinite world. Only nearby chunks and moving items are retained.
  function noise(seed,index,salt=0) {
    let n=(seed^Math.imul(index|0,374761393)^Math.imul(salt,668265263))|0;
    n=Math.imul(n^(n>>>13),1274126177);
    return ((n^(n>>>16))>>>0)/4294967296;
  }
  function updateLaneItems(lane,left=lane.left,right=lane.right) {
    if(!lane.streamed||!lane.spacing)return;
    const motion=lane.speed*clock;
    const first=Math.floor((left-lane.offset-motion)/lane.spacing)-1;
    const last=Math.ceil((right-lane.offset-motion)/lane.spacing)+1;
    for(const id of lane.itemMap.keys())if(id<first||id>last)lane.itemMap.delete(id);
    for(let id=first;id<=last;id++) {
      if(!lane.itemMap.has(id)) {
        const truck=noise(lane.seed,id,2)<.22;
        lane.itemMap.set(id,{id,length:lane.type==='water'?3.5:truck?2.5:1.75,truck,
          color:['#f5bd18','#cf3428','#f5f2e7','#177eae','#8564a8'][Math.floor(noise(lane.seed,id,3)*5)]});
      }
      const item=lane.itemMap.get(id);
      item.x=id*lane.spacing+lane.offset+motion;
    }
    lane.items=[...lane.itemMap.values()].sort((a,b)=>a.id-b.id);
  }
  function syncLane(lane,left,right) {
    if(!lane.streamed)return;
    for(const start of lane.chunks.keys())if(start<left||start>=right)lane.chunks.delete(start);
    for(let start=left;start<right;start+=CHUNK_WIDTH) {
      if(lane.chunks.has(start))continue;
      const chunk={start,end:start+CHUNK_WIDTH,trees:[],flowers:[]};
      if(lane.type==='grass')for(let x=start;x<chunk.end;x++) {
        // Regular clear columns keep the wider banks navigable.
        if(Math.abs(x)>2&&mod(x,8)>1&&noise(lane.seed,x,4)<.23)
          chunk.trees.push({x,pine:noise(lane.seed,x,5)<.3});
      }
      lane.chunks.set(start,chunk);
    }
    lane.left=left;lane.right=right;
    lane.trees=[...lane.chunks.values()].flatMap(c=>c.trees);
    lane.flowers=[...lane.chunks.values()].flatMap(c=>c.flowers);
    updateLaneItems(lane,left,right);
  }
  function generate() {
    while(nextRow < Math.max(20,Math.floor(camera)+22))makeLane(nextRow++);
    for(const y of lanes.keys())if(y<camera-13)lanes.delete(y);
    const radius=Math.max(16,Math.ceil((width||window.innerWidth)/48/2)+8);
    const left=Math.floor((Math.min(player.x,cameraX)-radius)/CHUNK_WIDTH)*CHUNK_WIDTH;
    const right=Math.ceil((Math.max(player.x,cameraX)+radius)/CHUNK_WIDTH)*CHUNK_WIDTH;
    for(const lane of lanes.values())syncLane(lane,left,right);
  }
  function reset() {
    lanes = new Map(); nextRow=-8; camera=0; cameraX=0; score=0; clock=0; idleTime=0;
    player={x:0,y:0,z:GRID.groundStandingHeight,hop:null,raft:null,localX:0,facing:'up',dead:false};
    particles=[]; queue=null; shake=0; deathTime=0; timerWarning=false; timerTenth=-1;
    oldBest=best; generate(); $('score').textContent='0'; $('biome').textContent='A FRESH START';
  }
  function start() {
    reset(); draw(); state='playing'; lastTime=performance.now();
    $('timer').hidden=false;updateTimer();
    $('welcome').hidden=true; $('overlay').hidden=true; $('scoreboard').hidden=false;
    $('pause').hidden=false; $('pause').textContent='Ⅱ'; $('pause').setAttribute('aria-label','Pause game');
    $('touch-controls').hidden=false; $('wash').classList.add('off');
    canvas.focus({preventScroll:true});
    notify('REACH A NEW ROW TO RESET YOUR 5-SECOND TIMER.');
  }
  function pause() {
    if(state==='playing') {
      state='paused'; queue=null;
      $('overlay-title').textContent='TAKE A BREATHER';
      $('result-kicker').textContent='THE ROAD CAN WAIT';
      $('reason').textContent='Your chicken is right where you left it.';
      $('result-stats').hidden=true; $('restart').innerHTML='KEEP HOPPING <span aria-hidden="true">↗</span>';
      $('restart-hint').textContent='or press P / Escape';
      $('overlay').hidden=false; $('pause').textContent='▶'; $('pause').setAttribute('aria-label','Resume game');
      $('restart').focus({preventScroll:true});
    } else if(state==='paused') {
      state='playing'; $('overlay').hidden=true; $('pause').textContent='Ⅱ';
      $('pause').setAttribute('aria-label','Pause game'); canvas.focus({preventScroll:true});
    }
  }
  function die(kind) {
    if(state!=='playing') return;
    state='dying'; player.dead=true; player.drowned=kind==='water'; player.hop=null; queue=null; deathTime=0;
    shake = reducedMotion ? 0 : .22;
    const messages = {
      car:['ROADKILL!',"Those cars don't stop for chickens."],
      water:['OH, CLUCK.','Chickens are great hoppers. Swimmers? Not so much.'],
      train:['WRONG TRACK.','Next time, wait for the train to pass.'],
      edge:['LEFT BEHIND!','Keep heading up the road.'],
      idle:["TIME'S UP!",'Five seconds without reaching a new row. Keep heading up the road!']
    };
    const [title,reason]=messages[kind];
    $('overlay-title').textContent=title; $('reason').textContent=reason;
    $('result-kicker').textContent=score>oldBest?'A NEW PERSONAL BEST!':'EVERY HOP IS A LITTLE BRAVER';
    $('final-score').textContent=score; $('final-best').textContent=best;
    $('result-stats').hidden=false;
    $('restart').innerHTML='ONE MORE HOP <span aria-hidden="true">↗</span>';
    $('restart-hint').textContent='or press Enter / Space';
    updateTimer();
    if(kind==='water') player.z=-.4;
    for(let i=0;i<16;i++) particles.push({x:player.x,y:player.y,z:.3,vx:random(-2,2),vy:random(-2,2),vz:random(2,5),life:random(.3,.8),color:kind==='water'?'#c1eef0':'#fff9d9'});

  }
  function raftLanding(lane,x,ahead=0) {
    for(const raft of lane.items) {
      const center=raft.x+lane.speed*ahead;
      const margin=raft.length/2-.375;
      if(Math.abs(x-center)>margin+GRID.pitch/2)continue;
      const localX=clamp(GRID.snap(x-center,GRID.raftOrigin),-margin,margin);
      return {raft,localX,x:center+localX};
    }
    return null;
  }
  function hop(dx,dy) {
    if(state!=='playing')return;
    if(player.hop){queue={dx,dy};return;}
    const ty=player.y+dy,lane=lanes.get(ty);
    let tx=GRID.snap(player.x+dx);
    if(!lane||lane.trees.some(tree=>Math.abs(tree.x-tx)<.7))return;
    let landing=lane.type==='water'?raftLanding(lane,player.x+dx,HOP_TIME):null;
    if(dy===0&&player.raft&&lane.items.includes(player.raft)) {
      const localX=GRID.snap(player.localX+dx,GRID.raftOrigin);
      if(Math.abs(localX)<=player.raft.length/2-.375)
        landing={raft:player.raft,localX,x:player.raft.x+lane.speed*HOP_TIME+localX};
    }
    if(landing)tx=landing.x;
    player.facing='up';
    player.hop={sx:player.x,sy:player.y,sz:player.z,tx,ty,tz:landing?GRID.raftStandingHeight:GRID.groundStandingHeight,
      raft:landing?.raft,localX:landing?.localX,t:0};
    player.raft=null;
  }
  function trainPosition(lane,atX=player.x) {
    const phase=mod(clock+lane.phase,lane.period);
    const base=lane.direction*(-25+phase*34),spacing=lane.period*34;
    const x=base+Math.round((atX-base)/spacing)*spacing;
    const approaching=lane.direction*(atX-x);
    return {active:true,x,warning:approaching>6&&approaching<6+34*2.2,travel:lane.direction*clock*34};
  }
  function update(dt,elapsed=dt) {
    if(state==='paused'||state==='over') return;
    clock+=dt;
    if(toastTime>0) { toastTime-=dt; if(toastTime<=0) $('toast').classList.remove('show'); }
    for(const lane of lanes.values()) {
      if(lane.streamed)updateLaneItems(lane);
      else for(const item of lane.items)item.x+=lane.speed*dt;
    }
    if(state==='playing') {
      idleTime+=elapsed;
      updateTimer();
      if(idleTime>=FORWARD_LIMIT) { die('idle'); return; }
      if(player.hop) {
        const h=player.hop; h.t+=dt;
        if(h.raft)h.tx=h.raft.x+h.localX;
        const t=clamp(h.t/HOP_TIME,0,1);
        player.x=h.sx+(h.tx-h.sx)*t; player.y=h.sy+(h.ty-h.sy)*t;
        player.z=h.sz+(h.tz-h.sz)*t+Math.sin(t*Math.PI)*.55;
        if(t>=1) {
          player.x=h.tx; player.y=h.ty; player.z=h.tz; player.hop=null;
          player.raft=h.raft||null;player.localX=h.localX||0;
          const previous=score; score=Math.max(score,player.y);
          if(score!==previous) {
            // Only a new furthest row earns a fresh five seconds. Returning
            // to a row already reached cannot be used to extend the timer.
            idleTime=0; timerWarning=false; updateTimer();
            $('score').textContent=score;
            if(score>best) {
              best=score; $('best').textContent=best;
              try { localStorage.setItem('crossy-road-best',String(best)); } catch (_) {}
            }
            if(score%10===0) { notify(score+' HOPS. LOOK AT YOU GO!'); }
            $('biome').textContent=score<10?'FIND YOUR FEET':score<25?'JUST ONE MORE HOP':score<50?'A CHICKEN ON A MISSION':'UNSTOPPABLE. ALMOST.';
          }
        }
      }
      const lane=lanes.get(Math.round(player.y));
      if(lane?.type==='road' && lane.items.some(item=>Math.abs(item.x-player.x)<item.length/2+.23) && Math.abs(player.y-lane.y)<.68) die('car');
      if(lane?.type==='rail') {
        const train=trainPosition(lane);
        if(train.active && Math.abs(train.x-player.x)<6.1 && Math.abs(player.y-lane.y)<.65) die('train');
      }
      if(state==='playing' && !player.hop && lane?.type==='water') {
        if(!player.raft||!lane.items.includes(player.raft)) {
          const landing=raftLanding(lane,player.x);
          if(landing){player.raft=landing.raft;player.localX=landing.localX;}
          else die('water');
        }
        if(state==='playing') {
          player.x=player.raft.x+player.localX;
          player.z=GRID.raftStandingHeight;
        }
      }
      if(state==='playing' && !player.hop && queue) { const move=queue; queue=null; hop(move.dx,move.dy); }
      if(player.y<camera-7) die('edge');
    }
    if(state==='dying') {
      deathTime+=dt;
      if(deathTime>.7) { state='over'; $('overlay').hidden=false; $('pause').hidden=true; $('touch-controls').hidden=true; $('restart').focus({preventScroll:true}); }
    }
    const target=state==='welcome'?1:Math.max(camera,player.y-.3);
    camera+=(target-camera)*Math.min(1,dt*6);
    cameraX+=(player.x-cameraX)*Math.min(1,dt*6);
    shake=Math.max(0,shake-dt);
    for(const p of particles) { p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; p.vz-=12*dt; p.life-=dt; }
    particles=particles.filter(p=>p.life>0);
    generate();
  }
  function draw() {
    renderer.draw({lanes,player,camera,cameraX,state,clock,particles,trainPosition});
  }
  function resize() {
    width=window.innerWidth;height=window.innerHeight;
    renderer.resize(width,height);draw();
  }
  const moves={ArrowUp:[0,1],w:[0,1],ArrowDown:[0,-1],s:[0,-1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};
  document.addEventListener('keydown',event=>{
    const key=event.key.length===1?event.key.toLowerCase():event.key;
    if(moves[key]) {
      event.preventDefault();
      if(state==='welcome') start();
      hop(...moves[key]);
    } else if(key==='p'||key==='Escape') { event.preventDefault(); pause(); }
    else if(key==='Enter'||key===' ') {
      // Preserve native activation of focused buttons.
      if(document.activeElement?.tagName==='BUTTON') return;
      event.preventDefault();
      if(state==='welcome'||state==='over') start();
      else if(state==='paused') pause();
      else if(state==='playing') hop(0,1);
    }
  });
  canvas.addEventListener('pointerdown',event=>{
    pointer={x:event.clientX,y:event.clientY,id:event.pointerId};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup',event=>{
    if(!pointer||event.pointerId!==pointer.id) return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;pointer=null;
    if(state==='welcome') { start(); return; }
    if(Math.hypot(dx,dy)<18) hop(0,1);
    else if(Math.abs(dx)>Math.abs(dy)) hop(Math.sign(dx),0);
    else hop(0,-Math.sign(dy));
  });
  canvas.addEventListener('pointercancel',()=>{pointer=null;});
  document.querySelectorAll('[data-move]').forEach(button=>{
    button.addEventListener('pointerdown',event=>{
      event.preventDefault();
      const direction={up:[0,1],down:[0,-1],left:[-1,0],right:[1,0]}[button.dataset.move];
      hop(...direction);
    });
  });
  $('start').addEventListener('click',start);
  $('restart').addEventListener('click',()=>state==='paused'?pause():start());
  $('pause').addEventListener('click',pause);
  window.addEventListener('resize',resize);
  window.addEventListener('blur',()=>{if(state==='playing') pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing') pause();});
  reset();resize();
  function frame(time) {
    const elapsed=Math.max(0,(time-lastTime)/1000||0);
    lastTime=time;
    // Catch up movement in small steps; a slow frame must not slow the countdown.
    let remaining=Math.min(elapsed,.25);
    if(elapsed>remaining)update(0,elapsed-remaining);
    while(remaining>1e-8) {
      const dt=Math.min(remaining,1/60);update(dt,dt);remaining-=dt;
    }
    if(state!=='paused'&&state!=='over')draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
