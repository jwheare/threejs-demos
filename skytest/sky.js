import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { Inspector } from 'three/addons/inspector/Inspector.js';

// import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { SkyMesh } from './skymesh.js';

import { WaterMesh } from 'three/addons/objects/WaterMesh.js';

const CONFIG = {
  lat: 56,
  lon: -3,

  timeOfDay: 0.4,
  dayOfYear: 242,
  timeSpeed: 0,

  turbidity: 0.5,
  rayleighMin: 0.1,
  rayleighMax: 4,
  // mieCoefficient: 0.004,
  mieCoefficient: 0.06,
  mieDirectionalGMin: 0.06,
  mieDirectionalGMax: 0.6,

  showSunDiscSky: true,
  showSunDiscEnv: true,
  environment: true,

  directionalLight: true,
  dirLightIntensityModifier: 0.5,

  waterRoughness: 0.2,
  waterPhysical: true,
  WaterMesh: false,

  toneMapping: 'ACESFilmicToneMapping',
  toneMappingExposure: 0.5,

  pmrem: false,
  renderTargetSize: 64,

};

const SCENE = {};

let gui;
function setupGui () { 
  gui = renderer.inspector.createParameters('Settings');
  
  const guiSky = gui.addFolder('Sky');

  // bool -> checkbox
  // string -> input
  // function -> button

  // Add sliders to number fields by passing min and max (and step)
  guiSky.add(CONFIG, 'turbidity', 0, 100, 0.1).onChange(updateSky);
  guiSky.add(CONFIG, 'rayleighMin', 0, 10, 0.01).onChange(updateSky);
  guiSky.add(CONFIG, 'rayleighMax', 0, 10, 0.1).onChange(updateSky);
  guiSky.add(CONFIG, 'mieCoefficient', 0, 0.1, 0.001).onChange(updateSky);
  guiSky.add(CONFIG, 'mieDirectionalGMin', 0, 1, 0.01).onChange(updateSky);
  guiSky.add(CONFIG, 'mieDirectionalGMax', 0, 1, 0.01).onChange(updateSky);

  const guiSun = gui.addFolder('Sun');
  guiSun.add(CONFIG, 'showSunDiscSky').onChange(updateRenderTarget);
  guiSun.add(CONFIG, 'showSunDiscEnv').onChange(updateRenderTarget);

  const guiLight = gui.addFolder('Lighting');
  guiLight.add(CONFIG, 'environment').onChange(updateRenderTarget);
  guiLight.add(CONFIG, 'directionalLight').onChange(updateDirLight);
  guiLight.add(CONFIG, 'dirLightIntensityModifier', 0, 1, 0.01).onChange(updateDirLight);

  const guiWater = gui.addFolder('Water');
  guiWater.add(CONFIG, 'waterRoughness', 0, 1, 0.1).onChange(updateWater);
  guiWater.add(CONFIG, 'waterPhysical').onChange(updateWater);
  guiWater.add(CONFIG, 'WaterMesh').onChange(updateWater);

  const guiTime = gui.addFolder('Time');

  guiTime.add(CONFIG, 'timeOfDay', 0, 1, 0.01).onChange(updateSky);
  guiTime.add(CONFIG, 'dayOfYear', 0, 365, 1).onChange(updateSky);
  guiTime.add(CONFIG, 'timeSpeed', 0, 1, 0.001);

  const guiRender = gui.addFolder('Render');

  guiRender.add(CONFIG, 'pmrem').onChange(updateRenderTarget);
  guiRender.add(CONFIG, 'renderTargetSize', [
    16,
    32,
    64,
    128,
    256,
    512,
    1024,
    2048,
  ]).onChange(updateRenderTarget);

  guiRender.add(CONFIG, 'toneMappingExposure', 0, 1, 0.1).onChange(updateToneMapping);
  // Create dropdowns by passing an array or object of named values
  guiRender.add(CONFIG, 'toneMapping', [
    'NoToneMapping',
    'LinearToneMapping',
    'ReinhardToneMapping',
    'CineonToneMapping',
    'ACESFilmicToneMapping',
    'AgXToneMapping',
    'NeutralToneMapping',
  ]).onChange(updateToneMapping);
}

// Scene setup
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(
  120,
  window.innerWidth / window.innerHeight,
  2,
  20000
);
camera.position.z = -30;
camera.position.y = 30;
camera.rotation.y = Math.PI;

// Renderer (WebGPU)
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGPURenderer({
  canvas,
  // antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

renderer.inspector = new Inspector();
setupGui();

// const renderPipeline = new THREE.RenderPipeline(renderer);

// renderPipeline.outputColorTransform = false;
// const scenePass = TSL.pass(scene, camera);
// const scenePassColor = scenePass.getTextureNode('output');

// const bloomPass = bloom(scenePassColor);
// bloomPass.threshold.value = 0;
// bloomPass.strength.value = 0.001;
// bloomPass.radius.value = 0;
// renderPipeline.outputNode = scenePassColor.add(bloomPass);

// const outputPass = TSL.renderOutput(scenePassColor);

// renderPipeline.outputNode = outputPass;
// renderPipeline.outputNode = scenePassColor;

updateToneMapping();

await renderer.init();

// Sky

const sky = new SkyMesh();
// sky.cloudCoverage.value = 0;
sky.scale.setScalar(10000);
scene.add(sky);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
scene.add(dirLight);

const ambLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambLight);

const pmremGenerator = new THREE.PMREMGenerator( renderer );
const sceneEnv = new THREE.Scene();
let pmremRenderTarget;

let cubeRenderTarget, cubeCamera;
function updateRenderTarget () {
  if (!CONFIG.pmrem) {
    if (cubeRenderTarget) {
      cubeRenderTarget.texture.dispose();
      cubeRenderTarget.dispose();
    }
    cubeRenderTarget = new THREE.CubeRenderTarget(CONFIG.renderTargetSize, {
      generateMipmaps: true,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearMipmapLinearFilter,
      type: THREE.HalfFloatType,
    });
    cubeCamera = new THREE.CubeCamera(1, 20000, cubeRenderTarget);
  }
  updateEnv();
}

function updatePMREM () {
  if (pmremRenderTarget !== undefined) {
    pmremRenderTarget.dispose();
  }
  sky.showSunDisc.value = CONFIG.showSunDiscEnv;
  sceneEnv.add(sky);
  pmremRenderTarget = pmremGenerator.fromScene(sceneEnv);
  scene.environment = pmremRenderTarget.texture;
  scene.add(sky);
}

function updateCubeCam () {
  scene.environment = cubeRenderTarget.texture;
  sky.showSunDisc.value = CONFIG.showSunDiscEnv;
  cubeCamera.update(renderer, sky);
}

function updateEnv () {
  if (CONFIG.environment) {
    if (CONFIG.pmrem) {
      updatePMREM();
    } else{
      updateCubeCam();
    }
  } else {
    if (scene.environment) {
      scene.environment.dispose();
    }
    scene.environment = null;
  }
  sky.showSunDisc.value = CONFIG.showSunDiscSky;
}

updateRenderTarget();

function asymCutoff (x, maxVal, minVal, negativeCutoff = 0.08) {
  x = THREE.MathUtils.clamp(x, -1, 1);

  if (x <= -negativeCutoff) {
    return 0; // hard cutoff
  } else if (x < 0) {
    // interpolate from 1 at 0 → 0 at -negativeCutoff
    return THREE.MathUtils.lerp(0, maxVal, (x + negativeCutoff) / negativeCutoff);
  } else if (x < 0.2) {
    // interpolate from 1 at 0 → 0.5 at 1
    return THREE.MathUtils.lerp(maxVal, minVal, x * 5);
  } else {
    return minVal;
  }
}

const SUN = {
  pos: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  alt: null,
  az: null,
};

function calcSunPosition () {
  const lat = THREE.MathUtils.degToRad(CONFIG.lat);

  // --- 1) Fractional year
  const gamma = 2*Math.PI * (CONFIG.dayOfYear - 1) / 365;

  // --- 2) Declination (radians) — Cooper 1969 fit (~0.25° typical error)
  const dec =
      0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2*gamma)
    + 0.000907 * Math.sin(2*gamma)
    - 0.002697 * Math.cos(3*gamma)
    + 0.00148  * Math.sin(3*gamma);

  // --- 3) Equation of Time (minutes)
  const eqTime = 229.18 * (
      0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2*gamma)
    - 0.040849 * Math.sin(2*gamma)
  );

  // --- 4) True Solar Time (fraction of day)
  // 4 * converts degrees -> minutes; east positive
  let tst = (CONFIG.timeOfDay * 1440 + eqTime + 4 * CONFIG.lon) / 1440;
  tst = ((tst % 1) + 1) % 1; // wrap 0..1

  // --- 5) Hour angle (radians). 0 at local solar noon; increases to the west
  const H = 2*Math.PI * (tst - 0.5);

  // --- 6) Alt/Az (radians). Azimuth: 0 = North, +CW (N=0,E=90,S=180,W=270)
  const sinAlt = Math.sin(lat)*Math.sin(dec) + Math.cos(lat)*Math.cos(dec)*Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const az = Math.atan2(
    Math.sin(H),
    -Math.cos(H) * Math.sin(lat) - Math.tan(dec)*Math.cos(lat)
  );
  const azCW = (az + Math.PI) % (2*Math.PI); // 0..2π from North, clockwise

  // --- 7) Unit direction vector (Y up, Z north, X east)
  const cosAlt = Math.cos(alt);
  const x =  cosAlt * Math.sin(azCW); // east
  const y =  Math.sin(alt);           // up
  const z =  cosAlt * Math.cos(azCW); // north

  SUN.pos.set(x, y, z);
  SUN.dir.copy(SUN.pos).normalize();
  SUN.alt = alt;
  SUN.az = azCW;
}

function updateSkyMaterial () {
  sky.sunPosition.value.copy(SUN.pos);
  sky.turbidity.value = CONFIG.turbidity;
  sky.rayleigh.value = asymCutoff(
    SUN.alt,
    CONFIG.rayleighMax,
    CONFIG.rayleighMin,
    0.08,
  );
  sky.mieCoefficient.value = CONFIG.mieCoefficient;
  sky.mieDirectionalG.value = asymCutoff(
    SUN.alt,
    CONFIG.mieDirectionalGMax,
    CONFIG.mieDirectionalGMin,
  );
}

function updateDirLight () {
  dirLight.visible = CONFIG.directionalLight;
  const lightPos = SUN.dir.clone();
  dirLight.position.copy(lightPos);
  dirLight.intensity = CONFIG.dirLightIntensityModifier * Math.max(0, SUN.alt);
}

// Water

const geomSize = 10000;
const geomSeg = 512;
const planeMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

const waterGeom = new THREE.PlaneGeometry(geomSize, geomSize, geomSeg, geomSeg);
waterGeom.applyMatrix4(planeMatrix);
const waterMatPhysical = new THREE.MeshPhysicalNodeMaterial({
    color: 0x66aaff,
    roughness: CONFIG.waterRoughness,
    metalness: 0,
    transmission: 1.0,
    ior: 1.33,
    thickness: -0.1,
  });
const waterMat = new THREE.MeshStandardNodeMaterial({
    color: 0x66aaff,
    roughness: CONFIG.waterRoughness,
    metalness: 0,
    transparent: true,
    opacity: 0.8,
  });
const water = new THREE.Mesh(waterGeom);
// water.renderOrder = 0;
water.receiveShadow = true;
scene.add(water);

const loader = new THREE.TextureLoader();
const waterNormals = loader.load( 'waternormals.jpg' );
waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

const waterMesh = new WaterMesh(waterGeom, {
  waterNormals: waterNormals,
  sunColor: 0xffffff,
  waterColor: 0x66aaff,
  distortionScale: 3.7
});
waterMesh.receiveShadow = true;
scene.add(waterMesh);
updateWater();

function updateWaterMeshSun () {
  waterMesh.sunDirection.value = SUN.dir;
}

function updateWater () {
  if (CONFIG.WaterMesh) {
    water.visible = false;
    waterMesh.visible = true;
  } else {
    water.material = CONFIG.waterPhysical ? waterMatPhysical : waterMat;
    water.material.roughness = CONFIG.waterRoughness;
    water.visible = true;
    waterMesh.visible = false;
  }
}

// Cube

const cube = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardNodeMaterial({
  color: 0xaaaaaa,
  roughness: 0.3,
}));
cube.receiveShadow = true;
cube.castShadow = true;
scene.add(cube);

function updateToneMapping () {
  renderer.toneMapping = THREE[CONFIG.toneMapping];
  renderer.toneMappingExposure = CONFIG.toneMappingExposure;
  console.log(CONFIG.toneMapping, THREE[CONFIG.toneMapping], renderer.toneMapping);
}

let DO_LOG = true;
function logValues () {
  DO_LOG = true;
}

function doLog () {
  if (DO_LOG) {
    console.log(
      CONFIG.timeOfDay, sky.rayleigh.value,
      SUN.dir
    );
    DO_LOG = false;
  }
}

function updateSky () {
  calcSunPosition();
  updateSkyMaterial();
  updateDirLight();
  updateWaterMeshSun();
  updateEnv();
  logValues();
}

updateSky();

function updateCube (time) {
  cube.position.y = Math.sin( time ) * 20 + 5;
  cube.rotation.x = time * 0.5;
  cube.rotation.z = time * 0.51;
}

// Animation loop
let lastTime = performance.now() * 0.001;
async function animate (ts) {
  const now = ts * 0.001;
  const deltaTime = now - lastTime;
  lastTime = now;
  const time = performance.now() * 0.001;

  if (CONFIG.timeSpeed) {
    CONFIG.timeOfDay += deltaTime * CONFIG.timeSpeed;
    if (CONFIG.timeOfDay > 1) {
      CONFIG.timeOfDay -= 1;
      CONFIG.dayOfYear = (CONFIG.dayOfYear + 1) % 366;
    }
    // CONFIG.dayOfYear = (CONFIG.dayOfYear + 1) % 366;
    updateSky();
  }

  updateCube(time);

  // doLog();

  // renderPipeline.render();
  renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start renderer
renderer.setAnimationLoop(animate);

// Export for external manipulation
Object.assign(SCENE, {
  scene,
  water,
  renderer,
  camera,
  sky,
  dirLight,
  SUN,
  CONFIG,
  gui,
  waterMesh
});

window.SCENE = SCENE;
