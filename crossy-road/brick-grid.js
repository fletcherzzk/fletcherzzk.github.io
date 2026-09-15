/* Shared stud coordinates for gameplay and the 3D models. */
(() => {
  const pitch=.25;
  const grid=Object.freeze({
    pitch,
    groundOffset:-pitch/2,
    groundStandingHeight:-.027,
    raftOrigin:pitch/2,
    raftStandingHeight:.223,
    snap(value,origin=0) { return origin+Math.round((value-origin)/pitch)*pitch; }
  });
  if(typeof module!=='undefined'&&module.exports)module.exports=grid;
  else globalThis.BrickGrid=grid;
})();
