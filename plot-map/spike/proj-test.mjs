import * as THREE from '../vendor/three.module.js';
const cam = new THREE.PerspectiveCamera(75, 16/9, .1, 1200);
// app.js convention, X-reflected (sphere viewed from inside)
const dirFromLonLat=(a,b)=>{const lo=a*Math.PI/180,la=b*Math.PI/180,cl=Math.cos(la);
  return new THREE.Vector3(-cl*Math.sin(lo),Math.sin(la),cl*Math.cos(lo));};
const YAW = { 'app  (lon + PI)': l=>l+Math.PI, 'spike (PI - lon)': l=>Math.PI-l };
for(const [name,yaw] of Object.entries(YAW)){
  const set=(lonD,latD)=>{cam.rotation.set(latD*Math.PI/180,yaw(lonD*Math.PI/180),0,'YXZ');
    cam.updateProjectionMatrix();cam.updateMatrixWorld(true);};
  let bad=0;
  const at=(lonV,latV,lonH,latH)=>{set(lonV,latV);return dirFromLonLat(lonH,latH).project(cam);};
  const t=(label,p,cond)=>{const ok=cond(p);if(!ok)bad++;
    console.log(`   ${ok?'ok  ':'FAIL'} ${label.padEnd(34)} ndc=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, z=${p.z.toFixed(2)})`);};
  console.log(`\n${name}`);
  t('hotspot==view, lon 0',   at(0,0,0,0),       p=>Math.abs(p.x)<.02&&Math.abs(p.y)<.02);
  t('hotspot==view, lon 137', at(137,0,137,0),   p=>Math.abs(p.x)<.02&&Math.abs(p.y)<.02);
  t('hotspot==view, pitched', at(40,25,40,25),   p=>Math.abs(p.x)<.02&&Math.abs(p.y)<.02);
  t('+20 lon appears RIGHT',  at(0,0,20,0),      p=>p.x>0.1);
  t('+20 lat appears UP',     at(0,0,0,20),      p=>p.y>0.1);
  t('opposite dir culled',    at(0,0,180,0),     p=>p.z>1);
  console.log(`   => ${bad?bad+' FAILURE(S)':'all consistent'}`);
}
