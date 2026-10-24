import * as THREE from "three";
import { createAudio } from "@/game/audio";
import type { ControlsProbe, Phase, TouchInput } from "@/game/types";

const STEP = 1 / 60;
const SAVE_KEY = "pinefold-save";

export type GraphicsQuality = "performance" | "balanced" | "high";
export type UpgradeId = "axe" | "pack" | "hand" | "saw" | "north" | "cabin" | "wheel";

export type Snap = {
  coins: number;
  pack: number;
  packCap: number;
  stock: number;
  stockCap: number;
  price: number;
  rate: number;
  axe: number;
  axeCost: number | null;
  packLv: number;
  packCost: number | null;
  hands: number;
  handCost: number | null;
  saw: boolean;
  sawCost: number | null;
  north: boolean;
  northCost: number | null;
  cabin: number;
  cabinCost: number | null;
  wheel: boolean;
  wheelCost: number | null;
  goal: string;
  banner: string;
  pop: { n: number; text: string } | null;
  lock: Partial<Record<UpgradeId, string>>;
};

type Save = {
  v: 1;
  coins: number;
  stock: number;
  axe: number;
  packLv: number;
  hands: number;
  saw: boolean;
  north: boolean;
  cabin: number;
  wheel: boolean;
  dumped: number;
  muted: boolean;
  lastAt: number;
};

export type PineHooks = {
  onPhase: (phase: Phase) => void;
  onReady: (meta: { muted: boolean }) => void;
  onError: (message: string) => void;
};

export type PineApi = {
  dispose: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  title: () => void;
  setMuted: (muted: boolean) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setCameraDistance: (distance: number) => void;
  setReducedMotion: (reduced: boolean) => void;
  buy: (id: UpgradeId) => void;
  snap: () => Snap;
};

const AXE_COST = [0, 12, 40, 110, 280];
const PACK_COST = [0, 16, 48, 140];
const PACK_CAP = [6, 12, 20, 30];
const HAND_COST = [28, 90, 220, 520];
const CABIN_COST = [100, 280, 700];

function loadSave(): Save {
  const blank: Save = {
    v: 1,
    coins: 0,
    stock: 0,
    axe: 1,
    packLv: 0,
    hands: 0,
    saw: false,
    north: false,
    cabin: 0,
    wheel: false,
    dumped: 0,
    muted: false,
    lastAt: Date.now(),
  };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return blank;
    const j = JSON.parse(raw) as Partial<Save>;
    if (j.v !== 1) return blank;
    return {
      ...blank,
      coins: num(j.coins),
      stock: num(j.stock),
      axe: clamp(Math.round(num(j.axe, 1)), 1, 5),
      packLv: clamp(Math.round(num(j.packLv)), 0, 3),
      hands: clamp(Math.round(num(j.hands)), 0, 4),
      saw: Boolean(j.saw),
      north: Boolean(j.north),
      cabin: clamp(Math.round(num(j.cabin)), 0, 3),
      wheel: Boolean(j.wheel),
      dumped: num(j.dumped),
      muted: Boolean(j.muted),
      lastAt: typeof j.lastAt === "number" ? j.lastAt : Date.now(),
    };
  } catch {
    return blank;
  }
}

function num(v: unknown, d = 0) {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function grassTex() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d");
  if (!g) return new THREE.CanvasTexture(c);
  g.fillStyle = "#456f42";
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 540; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = 12 + Math.random() * 66;
    g.fillStyle = Math.random() > 0.5 ? "rgba(100,146,77,0.25)" : "rgba(27,75,41,0.18)";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Fine grass flecks give the ground texture depth without making it noisy at distance.
  for (let i = 0; i < 1900; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    g.strokeStyle = Math.random() > 0.5 ? "rgba(176,190,108,0.20)" : "rgba(21,68,35,0.22)";
    g.lineWidth = 0.7 + Math.random() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y - (1 + Math.random() * 5));
    g.stroke();
  }
  const toPx = (x: number, z: number) => [(x / 100 + 0.5) * 1024, (z / 100 + 0.5) * 1024];
  g.fillStyle = "#c4a36a";
  g.beginPath();
  const yard = toPx(0, 12);
  g.ellipse(yard[0]!, yard[1]!, 78, 70, 0, 0, Math.PI * 2);
  g.fill();
  // A gently wandering dirt track with a darker, worn edge instead of a hard rectangle.
  const pathTop = toPx(0, -30)[1]!;
  const pathBottom = toPx(0, 16)[1]!;
  g.fillStyle = "rgba(53,48,30,.28)";
  g.beginPath();
  g.moveTo(482, pathTop); g.bezierCurveTo(466, 330, 512, 375, 486, 470);
  g.bezierCurveTo(478, 545, 492, 625, 465, pathBottom);
  g.lineTo(554, pathBottom);
  g.bezierCurveTo(526, 610, 543, 534, 534, 462);
  g.bezierCurveTo(520, 375, 550, 313, 539, pathTop);
  g.closePath(); g.fill();
  const trackGrad = g.createLinearGradient(480, 0, 550, 0);
  trackGrad.addColorStop(0, "#876544"); trackGrad.addColorStop(.28, "#b59568");
  trackGrad.addColorStop(.7, "#b18b58"); trackGrad.addColorStop(1, "#79583b");
  g.fillStyle = trackGrad;
  g.beginPath();
  g.moveTo(488, pathTop); g.bezierCurveTo(478, 324, 520, 377, 497, 470);
  g.bezierCurveTo(488, 548, 505, 626, 478, pathBottom);
  g.lineTo(540, pathBottom);
  g.bezierCurveTo(514, 612, 531, 536, 522, 462);
  g.bezierCurveTo(508, 376, 538, 310, 528, pathTop);
  g.closePath(); g.fill();
  // Small scuffs and stones break up the path so it reads as walkable terrain.
  for (let i = 0; i < 190; i++) {
    const y = pathTop + Math.random() * (pathBottom - pathTop);
    const centerX = 508 + Math.sin((y - pathTop) * 0.018) * 13;
    const x = centerX + (Math.random() - .5) * 48;
    if (x < 480 || x > 545) continue;
    g.fillStyle = Math.random() > .5 ? "rgba(64,45,28,.22)" : "rgba(232,199,145,.22)";
    g.beginPath(); g.ellipse(x, y, 1 + Math.random() * 4, 1 + Math.random() * 2.5, Math.random(), 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "#2c6a38";
  g.fillRect(0, 0, 1024, toPx(0, -32)[1]!);
  g.fillStyle = "#3a8f9a";
  g.beginPath();
  g.ellipse(toPx(22, 6)[0]!, toPx(22, 6)[1]!, 70, 150, 0.2, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

type Tree = {
  kind: "pine" | "hard";
  x: number;
  z: number;
  hp: number;
  max: number;
  state: "up" | "fall" | "stump";
  fall: number;
  respawn: number;
  upper: THREE.Group;
  sway: number;
  growing: boolean;
};

type Log = {
  x: number;
  z: number;
  amount: number;
  mesh: THREE.Mesh;
  alive: boolean;
  reserved: boolean;
};

type Hand = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  group: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  arm: THREE.Object3D;
  carryMesh: THREE.Object3D;
  state: "seek" | "chop" | "haul" | "mill";
  tree: Tree | null;
  carry: number;
  chopT: number;
  stuck: number;
  phase: number;
};

export function mountPine(
  canvas: HTMLCanvasElement,
  touch: TouchInput,
  hooks: PineHooks,
): PineApi {
  const save = loadSave();
  let coins = save.coins;
  let stock = save.stock;
  let axe = save.axe;
  let packLv = save.packLv;
  let hands = save.hands;
  let saw = save.saw;
  let north = save.north;
  let cabin = save.cabin;
  let wheel = save.wheel;
  let dumped = save.dumped;
  let muted = save.muted;
  let lastAt = save.lastAt;
  let pack = 0;
  let banner = "";
  let bannerT = 0;
  let pop: Snap["pop"] = null;
  let popN = 0;
  let sellAcc = 0;
  let saveAcc = 0;
  let chopCd = 0;
  let stepT = 0;
  let bob = 0;
  let offlineNote = "";

  const audio = createAudio();
  audio.setMuted(muted);
  let reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let graphicsQuality: GraphicsQuality = "high";
  let cameraDistance = 8.4;
  let cameraYaw = 0;
  let cameraPitch = 0;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance", stencil: false, depth: true, preserveDrawingBuffer: false });
  } catch (err) {
    hooks.onError(err instanceof Error ? err.message : "Could not start the forest.");
    throw err;
  }
  renderer.setClearColor(0x8ec8ea, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa6d4eb);
  scene.fog = new THREE.FogExp2(0xd8e9cf, 0.0095);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xfff5df, 0x34603d, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.9);
  sun.position.set(18, 28, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 46;
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -16;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.AmbientLight(0xffffff, 0.28));
  const windowLight = new THREE.PointLight(0xffb15a, 0, 8, 2);
  windowLight.position.set(-14, 1.6, 13);
  scene.add(windowLight);

  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const trackG = <T extends THREE.BufferGeometry>(g: T) => { geos.add(g); return g; };
  const trackM = <T extends THREE.Material>(m: T) => { mats.add(m); return m; };
  const trackT = <T extends THREE.Texture>(texture: T) => { textures.add(texture); return texture; };

  function skyTexture() {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
    const g = c.getContext("2d")!;
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#62a9de");
    sky.addColorStop(.34, "#9acde8");
    sky.addColorStop(.62, "#d9e6dc");
    sky.addColorStop(.82, "#e8dfb9");
    sky.addColorStop(1, "#b2c89b");
    g.fillStyle = sky; g.fillRect(0, 0, 1024, 512);
    const glow = g.createRadialGradient(730, 300, 3, 730, 300, 230);
    glow.addColorStop(0, "rgba(255,245,205,.52)");
    glow.addColorStop(.35, "rgba(255,239,194,.2)");
    glow.addColorStop(1, "rgba(255,239,194,0)");
    g.fillStyle = glow; g.fillRect(440, 60, 560, 450);
    // Soft, distant cloud wisps give the sky a natural illustrated-game finish.
    for (let i = 0; i < 24; i++) {
      const x = Math.random() * 1150 - 65;
      const y = 55 + Math.random() * 165;
      const w = 45 + Math.random() * 105;
      const h = 10 + Math.random() * 18;
      const cloud = g.createRadialGradient(x, y, 1, x, y, w);
      cloud.addColorStop(0, "rgba(255,255,247,.28)");
      cloud.addColorStop(.55, "rgba(244,250,241,.15)");
      cloud.addColorStop(1, "rgba(244,250,241,0)");
      g.fillStyle = cloud; g.save(); g.translate(x, y); g.scale(1, h / w); g.translate(-x, -y); g.fillRect(x - w, y - w, w * 2, w * 2); g.restore();
    }
    const tex = trackT(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 4;
    return tex;
  }

  const skyDome = new THREE.Mesh(
    trackG(new THREE.SphereGeometry(88, 40, 24)),
    trackM(new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false })),
  );
  skyDome.renderOrder = -100;
  scene.add(skyDome);

  const groundTex = trackT(grassTex());
  const ground = new THREE.Mesh(
    trackG(new THREE.PlaneGeometry(100, 100)),
    trackM(new THREE.MeshStandardMaterial({ map: groundTex, bumpMap: groundTex, bumpScale: 0.018, roughness: 0.98, metalness: 0 })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  function materialTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1) {
    const tex = trackT(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY); tex.anisotropy = 8; tex.needsUpdate = true;
    return tex;
  }

  function barkTexture() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 512;
    const g = c.getContext("2d")!;
    const base = g.createLinearGradient(0, 0, 512, 0);
    base.addColorStop(0, "#50311f"); base.addColorStop(.18, "#91603b"); base.addColorStop(.4, "#644027");
    base.addColorStop(.61, "#a17249"); base.addColorStop(.82, "#5a3824"); base.addColorStop(1, "#7d5032");
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 185; i++) {
      const x = Math.random() * 512;
      g.strokeStyle = Math.random() > .5 ? "rgba(37,21,13,.42)" : "rgba(222,170,112,.23)";
      g.lineWidth = 1 + Math.random() * 6;
      g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + (Math.random() - .5) * 22, 160, x + (Math.random() - .5) * 18, 340, x + (Math.random() - .5) * 12, 512);
      g.stroke();
    }
    for (let i = 0; i < 11; i++) {
      const x = 18 + Math.random() * 476, y = 18 + Math.random() * 476;
      g.strokeStyle = "rgba(39,23,14,.46)"; g.lineWidth = 3;
      g.beginPath(); g.ellipse(x, y, 5 + Math.random() * 10, 10 + Math.random() * 20, (Math.random() - .5) * .25, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = "rgba(221,166,101,.36)"; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(x + 1, y, 2 + Math.random() * 4, 5 + Math.random() * 8, 0, 0, Math.PI * 2); g.stroke();
    }
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = Math.random() > .5 ? "rgba(22,15,10,.13)" : "rgba(255,221,160,.1)";
      g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 5);
    }
    return materialTexture(c, 1, 1.25);
  }

  function foliageTexture() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const g = c.getContext("2d")!;
    const base = g.createLinearGradient(0, 0, 256, 256);
    // Keep the leaf texture mostly neutral so each tree material can tint it without crushing the greens.
    base.addColorStop(0, "#aeb4a2"); base.addColorStop(.5, "#d0d3c0"); base.addColorStop(1, "#858d7b");
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const colors = ["rgba(245,245,228,.38)", "rgba(38,45,32,.34)", "rgba(171,177,153,.43)", "rgba(228,224,202,.22)"];
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, w = 5 + Math.random() * 15, h = 3 + Math.random() * 9;
      g.save(); g.translate(x, y); g.rotate((Math.random() - .5) * .9);
      g.fillStyle = colors[Math.floor(Math.random() * colors.length)]!;
      g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(229,232,155,.28)"; g.lineWidth = .7; g.beginPath(); g.moveTo(-w * .7, 0); g.lineTo(w * .7, 0); g.stroke();
      g.restore();
    }
    return materialTexture(c);
  }

  function plankTexture() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 256;
    const g = c.getContext("2d")!;
    const base = g.createLinearGradient(0, 0, 0, 256);
    base.addColorStop(0, "#97623a"); base.addColorStop(.28, "#c08a55"); base.addColorStop(.52, "#a87443"); base.addColorStop(.78, "#d09b61"); base.addColorStop(1, "#82512f");
    g.fillStyle = base; g.fillRect(0, 0, 512, 256);
    [84, 170].forEach((y) => { g.fillStyle = "rgba(56,32,18,.32)"; g.fillRect(0, y, 512, 3); g.fillStyle = "rgba(255,213,151,.2)"; g.fillRect(0, y + 3, 512, 1); });
    for (let i = 0; i < 155; i++) {
      const y = Math.random() * 256, x = Math.random() * 512;
      g.strokeStyle = Math.random() > .52 ? "rgba(67,39,21,.27)" : "rgba(255,219,160,.19)";
      g.lineWidth = .5 + Math.random() * 1.5;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 35, y + (Math.random() - .5) * 6, x + 72, y + (Math.random() - .5) * 6, x + 125, y + (Math.random() - .5) * 5); g.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * 512, y = 14 + Math.random() * 228;
      g.strokeStyle = "rgba(62,35,18,.38)"; g.lineWidth = 1.6;
      g.beginPath(); g.ellipse(x, y, 4 + Math.random() * 6, 2 + Math.random() * 4, 0, 0, Math.PI * 2); g.stroke();
    }
    return materialTexture(c, 1.4, 1);
  }

  function fabricTexture() {
    const c = document.createElement("canvas"); c.width = 128; c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#d2d0c7"; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 620; i++) {
      g.strokeStyle = Math.random() > .5 ? "rgba(255,255,255,.17)" : "rgba(43,39,28,.11)";
      g.lineWidth = .6 + Math.random() * .5;
      const x = Math.random() * 128, y = Math.random() * 128;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() > .5 ? 1 : 0), y + 2 + Math.random() * 3); g.stroke();
    }
    return materialTexture(c, 1.8, 1.8);
  }

  function stoneTexture() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const g = c.getContext("2d")!;
    const base = g.createLinearGradient(0, 0, 256, 256);
    base.addColorStop(0, "#9b9d92"); base.addColorStop(.42, "#696e64"); base.addColorStop(1, "#b3aa96");
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1700; i++) {
      g.fillStyle = Math.random() > .48 ? "rgba(31,37,31,.2)" : "rgba(245,239,216,.18)";
      g.fillRect(Math.random() * 256, Math.random() * 256, .5 + Math.random() * 2.4, .5 + Math.random() * 2.2);
    }
    for (let i = 0; i < 24; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      g.strokeStyle = "rgba(43,47,40,.22)"; g.lineWidth = .8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 16, y + 3 + Math.random() * 15); g.stroke();
    }
    return materialTexture(c);
  }

  function endGrainTexture() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const g = c.getContext("2d")!;
    const base = g.createRadialGradient(114, 120, 2, 126, 124, 150);
    base.addColorStop(0, "#e4b878"); base.addColorStop(.38, "#b9854d"); base.addColorStop(.7, "#d5a266"); base.addColorStop(1, "#80512f");
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 17; i++) {
      g.strokeStyle = i % 2 ? "rgba(88,51,28,.42)" : "rgba(255,225,172,.32)";
      g.lineWidth = i % 4 === 0 ? 2.2 : .9;
      g.beginPath(); g.ellipse(116 + Math.sin(i * 1.7) * 6, 124 + Math.cos(i * 1.3) * 5, 6 + i * 6.8, 5 + i * 6.6, (i % 3) * .04, 0, Math.PI * 2); g.stroke();
    }
    g.strokeStyle = "rgba(77,46,24,.48)"; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(126, 120); g.lineTo(158, 89); g.moveTo(128, 126); g.lineTo(155, 150); g.stroke();
    return materialTexture(c);
  }

  const barkTex = barkTexture();
  const leafTex = foliageTexture();
  const plankTex = plankTexture();
  const fabricTex = fabricTexture();
  const stoneTex = stoneTexture();
  const endGrainTex = endGrainTexture();
  const trunkMat = trackM(new THREE.MeshStandardMaterial({ color: 0xffffff, map: barkTex, bumpMap: barkTex, bumpScale: 0.045, roughness: 0.94 }));
  const stumpMat = trackM(new THREE.MeshStandardMaterial({ color: 0x99714b, map: barkTex, bumpMap: barkTex, bumpScale: 0.035, roughness: 0.98 }));
  const stumpCutMat = trackM(new THREE.MeshStandardMaterial({ color: 0xe0b17a, map: endGrainTex, bumpMap: endGrainTex, bumpScale: 0.025, roughness: 0.9 }));
  const leafA = trackM(new THREE.MeshStandardMaterial({ color: 0x78a354, map: leafTex, roughness: 0.9 }));
  const leafB = trackM(new THREE.MeshStandardMaterial({ color: 0x8cb65b, map: leafTex, roughness: 0.88 }));
  const leafC = trackM(new THREE.MeshStandardMaterial({ color: 0x3e723d, map: leafTex, roughness: 0.91 }));
  const hardMat = trackM(new THREE.MeshStandardMaterial({ color: 0x769447, map: leafTex, roughness: 0.91 }));
  const hardMat2 = trackM(new THREE.MeshStandardMaterial({ color: 0x4d773a, map: leafTex, roughness: 0.92 }));
  const woodMat = trackM(new THREE.MeshStandardMaterial({ color: 0xffffff, map: plankTex, bumpMap: plankTex, bumpScale: 0.022, roughness: 0.86 }));
  const logSideMat = trackM(new THREE.MeshStandardMaterial({ color: 0xf2dfc0, map: barkTex, bumpMap: barkTex, bumpScale: 0.035, roughness: 0.94 }));
  const logEndMat = trackM(new THREE.MeshStandardMaterial({ color: 0xffd9a1, map: endGrainTex, bumpMap: endGrainTex, bumpScale: 0.012, roughness: 0.88 }));
  const dirtMat = trackM(new THREE.MeshStandardMaterial({ color: 0x8d6a43, roughness: 0.92 }));
  const skinMat = trackM(new THREE.MeshStandardMaterial({ color: 0xe0b48a, roughness: 0.7 }));
  const shirtMat = trackM(new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTex, roughness: 0.83 }));
  const pantMat = trackM(new THREE.MeshStandardMaterial({ color: 0x243044, map: fabricTex, roughness: 0.88 }));
  const hatMat = trackM(new THREE.MeshStandardMaterial({ color: 0xc4552a, map: fabricTex, roughness: 0.86 }));
  const steelMat = trackM(new THREE.MeshStandardMaterial({ color: 0xd7e0e2, roughness: 0.24, metalness: 0.86 }));
  const axePolishedMat = trackM(new THREE.MeshStandardMaterial({ color: 0x9fc9d3, roughness: 0.2, metalness: 0.96 }));
  const axeLegendMat = trackM(new THREE.MeshStandardMaterial({ color: 0xd7a74a, roughness: 0.24, metalness: 0.88 }));
  const axeEdgeMat = trackM(new THREE.MeshStandardMaterial({ color: 0xf2f5ed, roughness: 0.18, metalness: 0.92 }));
  const gripMat = trackM(new THREE.MeshStandardMaterial({ color: 0x57351f, roughness: 0.88 }));
  const bootMat = trackM(new THREE.MeshStandardMaterial({ color: 0x493021, roughness: 0.9 }));
  const brassMat = trackM(new THREE.MeshStandardMaterial({ color: 0xc28b3a, roughness: 0.34, metalness: 0.62 }));
  const waterMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x3a9aaa, roughness: 0.22, metalness: 0.08, transparent: true, opacity: 0.92 }),
  );

  const trunkGeo = trackG(new THREE.CylinderGeometry(0.16, 0.26, 1.7, 9));
  const stumpGeo = trackG(new THREE.CylinderGeometry(0.22, 0.28, 0.28, 9));
  const leafGeo = trackG(new THREE.ConeGeometry(1.25, 1.7, 11));
  const leafGeo2 = trackG(new THREE.ConeGeometry(0.92, 1.35, 11));
  const leafGeo3 = trackG(new THREE.ConeGeometry(0.55, 0.95, 9));
  const hardGeo = trackG(new THREE.SphereGeometry(1.05, 14, 10));
  const branchGeo = trackG(new THREE.CylinderGeometry(0.035, 0.075, 0.8, 8));
  const logGeo = trackG(new THREE.CylinderGeometry(0.13, 0.145, 1.04, 12, 1));
  const logMaterials: THREE.Material[] = [logSideMat, logEndMat, logEndMat];

  const axeProfile = new THREE.Shape();
  axeProfile.moveTo(-0.08, 0.045);
  axeProfile.lineTo(0.02, 0.055);
  axeProfile.lineTo(0.09, 0.12);
  axeProfile.quadraticCurveTo(0.22, 0.145, 0.345, 0.065);
  axeProfile.quadraticCurveTo(0.405, 0.015, 0.37, -0.045);
  axeProfile.lineTo(0.26, -0.09);
  axeProfile.lineTo(0.1, -0.075);
  axeProfile.lineTo(0.015, -0.035);
  axeProfile.lineTo(-0.08, -0.035);
  axeProfile.closePath();
  const axeHeadGeo = trackG(new THREE.ExtrudeGeometry(axeProfile, {
    depth: 0.065, bevelEnabled: true, bevelSegments: 2, steps: 1,
    bevelSize: 0.012, bevelThickness: 0.012, curveSegments: 6,
  }));
  const axeEdgeShape = new THREE.Shape();
  axeEdgeShape.moveTo(0.342, 0.061);
  axeEdgeShape.quadraticCurveTo(0.4, 0.015, 0.368, -0.04);
  axeEdgeShape.lineTo(0.344, -0.047);
  axeEdgeShape.quadraticCurveTo(0.366, 0.012, 0.329, 0.052);
  axeEdgeShape.closePath();
  const axeEdgeGeo = trackG(new THREE.ExtrudeGeometry(axeEdgeShape, { depth: 0.009, bevelEnabled: false, steps: 1 }));

  const trees: Tree[] = [];
  function addTree(kind: "pine" | "hard", x: number, z: number, scale: number) {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    const stump = new THREE.Mesh(stumpGeo, [stumpMat, stumpCutMat, stumpCutMat]);
    stump.position.y = 0.12;
    root.add(stump);
    const upper = new THREE.Group();
    upper.position.y = 0.22;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.85;
    trunk.scale.y = kind === "hard" ? 1.25 : 1;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    upper.add(trunk);
    if (kind === "pine") {
      const a = new THREE.Mesh(leafGeo, scale > 1 ? leafB : leafA);
      a.position.y = 2.05;
      const b = new THREE.Mesh(leafGeo2, leafB);
      b.position.y = 2.9;
      const tip = new THREE.Mesh(leafGeo3, leafC);
      tip.position.y = 3.55;
      upper.add(a, b, tip);
    } else {
      const a = new THREE.Mesh(hardGeo, hardMat);
      a.position.y = 2.35;
      a.scale.set(1.15, 0.85, 1.15);
      const b = new THREE.Mesh(hardGeo, hardMat2);
      b.position.set(0.35, 2.05, 0.1);
      b.scale.set(0.78, 0.75, 0.78);
      const c = new THREE.Mesh(hardGeo, leafB);
      c.position.set(-0.42, 2.48, 0.08);
      c.scale.set(0.72, 0.7, 0.74);
      const d = new THREE.Mesh(hardGeo, leafC);
      d.position.set(0.08, 2.58, -0.38);
      d.scale.set(0.64, 0.62, 0.66);
      const branchL = new THREE.Mesh(branchGeo, trunkMat);
      branchL.position.set(-0.16, 1.45, 0.02);
      branchL.rotation.z = 0.62;
      branchL.rotation.x = -0.12;
      const branchR = new THREE.Mesh(branchGeo, trunkMat);
      branchR.position.set(0.18, 1.52, 0.02);
      branchR.rotation.z = -0.58;
      branchR.rotation.x = 0.1;
      upper.add(branchL, branchR, a, b, c, d);
    }
    upper.scale.setScalar(scale);
    upper.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    root.add(upper);
    scene.add(root);
    const max = kind === "hard" ? 6 : 3;
    trees.push({
      kind,
      x,
      z,
      hp: max,
      max,
      state: "up",
      fall: 0,
      respawn: 0,
      upper,
      sway: Math.random() * 6,
      growing: false,
    });
  }

  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807 + 11) % 2147483647;
    return (seed & 2147483646) / 2147483647;
  };
  let pines = 0;
  let guard = 0;
  while (pines < 34 && guard < 400) {
    guard++;
    const x = (rnd() * 2 - 1) * 24;
    const z = -26 + rnd() * 30;
    if (Math.abs(x) < 3.4 && z > -4 && z < 16) continue;
    if (Math.hypot(x + 14, z - 13) < 4.2) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.5)) continue;
    addTree("pine", x, z, 0.86 + rnd() * 0.4);
    pines++;
  }
  for (let i = 0; i < 14; i++) {
    const x = -18 + (i % 5) * 9 + (rnd() - 0.5) * 2;
    const z = -46 + Math.floor(i / 5) * 5.5 + (rnd() - 0.5);
    addTree("hard", x, z, 0.95 + rnd() * 0.35);
  }

  const tuft = new THREE.InstancedMesh(
    trackG(new THREE.ConeGeometry(0.16, 0.5, 4)),
    trackM(new THREE.MeshStandardMaterial({ color: 0x9fbd65, map: leafTex, roughness: 1 })),
    180,
  );
  const tuftDummy = new THREE.Object3D();
  let tuftN = 0;
  while (tuftN < 180) {
    const x = (rnd() * 2 - 1) * 26;
    const z = -48 + rnd() * 66;
    if (Math.abs(x) < 3.6 && z > 7 && z < 16) continue;
    if (Math.hypot(x, z - 6) < 1.6) continue;
    tuftDummy.position.set(x, 0.18, z);
    tuftDummy.rotation.y = rnd() * 6;
    const s = 0.55 + rnd() * 0.9;
    tuftDummy.scale.set(s, 0.7 + rnd() * 0.8, s);
    tuftDummy.updateMatrix();
    tuft.setMatrixAt(tuftN, tuftDummy.matrix);
    tuftN++;
  }
  tuft.instanceMatrix.needsUpdate = true;
  scene.add(tuft);

  const rockMat = trackM(new THREE.MeshStandardMaterial({ color: 0xffffff, map: stoneTex, bumpMap: stoneTex, bumpScale: 0.035, roughness: 0.96 }));
  const rockGeo = trackG(new THREE.SphereGeometry(0.35, 10, 8));
  for (let i = 0; i < 20; i++) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set((rnd() * 2 - 1) * 22, 0.08, -20 + rnd() * 28);
    rock.scale.set(1 + rnd(), 0.45, 1 + rnd() * 0.6);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }
  const bloom = new THREE.InstancedMesh(
    trackG(new THREE.SphereGeometry(0.07, 5, 4)),
    trackM(new THREE.MeshStandardMaterial({ color: 0xf2d15a, roughness: 0.5 })),
    36,
  );
  for (let i = 0; i < 36; i++) {
    tuftDummy.position.set((rnd() * 2 - 1) * 20, 0.08, -8 + rnd() * 22);
    tuftDummy.rotation.set(0, 0, 0);
    tuftDummy.scale.setScalar(0.7 + rnd());
    tuftDummy.updateMatrix();
    bloom.setMatrixAt(i, tuftDummy.matrix);
  }
  bloom.instanceMatrix.needsUpdate = true;
  scene.add(bloom);

  // Wildflower clusters add a little color and scale to the forest floor without
  // creating hundreds of individual draw calls on mobile devices.
  const flowerStemGeo = trackG(new THREE.CylinderGeometry(0.012, 0.018, 0.22, 5));
  const flowerPetalGeo = trackG(new THREE.SphereGeometry(0.065, 6, 5));
  const flowerStemMat = trackM(new THREE.MeshStandardMaterial({ color: 0x47733b, roughness: 1 }));
  const flowerMats = [
    trackM(new THREE.MeshStandardMaterial({ color: 0xf4d9a2, roughness: 0.82 })),
    trackM(new THREE.MeshStandardMaterial({ color: 0xe6a5a9, roughness: 0.82 })),
    trackM(new THREE.MeshStandardMaterial({ color: 0xc5b2e8, roughness: 0.82 })),
  ];
  const flowerStems = new THREE.InstancedMesh(flowerStemGeo, flowerStemMat, 72);
  const flowerHeads = flowerMats.map((mat) => new THREE.InstancedMesh(flowerPetalGeo, mat, 24));
  const flowerStemDummy = new THREE.Object3D();
  const flowerHeadDummies = flowerMats.map(() => new THREE.Object3D());
  for (let i = 0; i < 72; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 8; tries++) {
      x = (rnd() * 2 - 1) * 23;
      z = -38 + rnd() * 52;
      if (!(Math.abs(x) < 4.2 && z > 3 && z < 17)) break;
    }
    const y = 0.13;
    flowerStemDummy.position.set(x, y, z);
    flowerStemDummy.rotation.set((rnd() - 0.5) * 0.22, rnd() * Math.PI, (rnd() - 0.5) * 0.22);
    flowerStemDummy.scale.setScalar(0.65 + rnd() * 0.7);
    flowerStemDummy.updateMatrix();
    flowerStems.setMatrixAt(i, flowerStemDummy.matrix);
    const kind = i % flowerHeads.length;
    const head = flowerHeadDummies[kind]!;
    head.position.set(x, y + 0.12, z);
    head.rotation.set(rnd() * 0.4, rnd() * Math.PI, rnd() * 0.4);
    head.scale.setScalar(0.7 + rnd() * 0.65);
    head.updateMatrix();
    flowerHeads[kind]!.setMatrixAt(Math.floor(i / flowerHeads.length), head.matrix);
  }
  flowerStems.instanceMatrix.needsUpdate = true;
  flowerHeads.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  scene.add(flowerStems, ...flowerHeads);

  // A few fallen timber pieces make the woods feel like a working lumber camp.
  const fallenLog = new THREE.Group();
  const fallenBark = trackM(new THREE.MeshStandardMaterial({ color: 0x6b4930, map: barkTex, bumpMap: barkTex, bumpScale: 0.035, roughness: 0.96 }));
  const fallenCut = trackM(new THREE.MeshStandardMaterial({ color: 0xd4ad79, map: endGrainTex, bumpMap: endGrainTex, bumpScale: 0.02, roughness: 0.9 }));
  for (let i = 0; i < 7; i++) {
    const length = 1.4 + rnd() * 1.5;
    const log = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.19, 0.2, length, 9)), fallenBark);
    log.rotation.z = Math.PI / 2 + (rnd() - 0.5) * 0.12;
    log.position.set(0, 0.2, 0);
    log.castShadow = true;
    log.receiveShadow = true;
    const endA = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.18, 0.18, 0.012, 9)), fallenCut);
    const endB = endA.clone();
    endA.rotation.z = endB.rotation.z = Math.PI / 2;
    endA.position.set(-length / 2, 0.2, 0);
    endB.position.set(length / 2, 0.2, 0);
    fallenLog.add(log, endA, endB);
    fallenLog.position.set((rnd() > 0.5 ? 1 : -1) * (7 + rnd() * 11), 0, -20 + rnd() * 34);
    fallenLog.rotation.y = rnd() * Math.PI;
    scene.add(fallenLog.clone());
    fallenLog.clear();
  }

  // Forest floor details: mushroom patches and fern-like plants make the woods
  // feel discovered rather than like an empty grid. These are lightweight meshes.
  const mushroomStemMat = trackM(new THREE.MeshStandardMaterial({ color: 0xe7d9b8, roughness: 0.9 }));
  const mushroomCapMats = [
    trackM(new THREE.MeshStandardMaterial({ color: 0xc85d43, roughness: 0.82 })),
    trackM(new THREE.MeshStandardMaterial({ color: 0xe2a34e, roughness: 0.82 })),
    trackM(new THREE.MeshStandardMaterial({ color: 0x9a6fba, roughness: 0.82 })),
  ];
  const mushroomStemGeo = trackG(new THREE.CylinderGeometry(0.045, 0.06, 0.18, 7));
  const mushroomCapGeo = trackG(new THREE.SphereGeometry(0.13, 8, 6));
  for (let patch = 0; patch < 12; patch++) {
    const px = (rnd() * 2 - 1) * 21;
    const pz = -34 + rnd() * 47;
    if (Math.abs(px) < 4 && pz > 5 && pz < 17) continue;
    const count = 2 + Math.floor(rnd() * 3);
    for (let j = 0; j < count; j++) {
      const mushroom = new THREE.Group();
      const stem = new THREE.Mesh(mushroomStemGeo, mushroomStemMat);
      stem.position.y = 0.09;
      const cap = new THREE.Mesh(mushroomCapGeo, mushroomCapMats[Math.floor(rnd() * mushroomCapMats.length)]!);
      cap.scale.set(1, 0.55, 1);
      cap.position.y = 0.2;
      mushroom.add(stem, cap);
      mushroom.position.set(px + (rnd() - 0.5) * 1.1, 0, pz + (rnd() - 0.5) * 1.1);
      mushroom.scale.setScalar(0.65 + rnd() * 0.65);
      mushroom.rotation.y = rnd() * Math.PI * 2;
      scene.add(mushroom);
    }
  }

  const fernMat = trackM(new THREE.MeshStandardMaterial({ color: 0x356d3e, roughness: 1, side: THREE.DoubleSide }));
  const fernGeo = trackG(new THREE.ConeGeometry(0.11, 0.72, 4));
  for (let i = 0; i < 28; i++) {
    const fern = new THREE.Group();
    const fronds = 3 + Math.floor(rnd() * 3);
    for (let j = 0; j < fronds; j++) {
      const frond = new THREE.Mesh(fernGeo, fernMat);
      frond.position.set(Math.cos(j * 2.4) * 0.12, 0.25, Math.sin(j * 2.4) * 0.12);
      frond.rotation.z = (rnd() - 0.5) * 0.8;
      frond.rotation.x = (rnd() - 0.5) * 0.8;
      frond.scale.set(0.65, 0.8 + rnd() * 0.65, 0.65);
      fern.add(frond);
    }
    fern.position.set((rnd() * 2 - 1) * 23, 0, -38 + rnd() * 54);
    fern.rotation.y = rnd() * Math.PI * 2;
    scene.add(fern);
  }

  // A tiny timber campfire beside the cabin, with a stone ring and warm glow.
  const firePit = new THREE.Group();
  firePit.position.set(-10.8, 0, 10.1);
  scene.add(firePit);
  const fireStoneGeo = trackG(new THREE.DodecahedronGeometry(0.18, 0));
  const fireStoneMat = trackM(new THREE.MeshStandardMaterial({ color: 0x77786b, roughness: 1 }));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const stone = new THREE.Mesh(fireStoneGeo, fireStoneMat);
    stone.position.set(Math.cos(a) * 0.62, 0.13, Math.sin(a) * 0.62);
    stone.scale.set(1, 0.65, 0.8);
    stone.rotation.y = a;
    stone.castShadow = true;
    firePit.add(stone);
  }
  const firewoodGeo = trackG(new THREE.CylinderGeometry(0.09, 0.1, 1.05, 7));
  const firewoodMat = trackM(new THREE.MeshStandardMaterial({ color: 0x68452b, roughness: 1 }));
  for (let i = 0; i < 3; i++) {
    const wood = new THREE.Mesh(firewoodGeo, firewoodMat);
    wood.rotation.z = Math.PI / 2;
    wood.rotation.y = i * Math.PI / 3;
    wood.position.y = 0.24 + i * 0.07;
    firePit.add(wood);
  }
  const flameMat = trackM(new THREE.MeshStandardMaterial({ color: 0xff8a30, emissive: 0xff4d12, emissiveIntensity: 1.6, roughness: 0.5 }));
  const flame = new THREE.Mesh(trackG(new THREE.ConeGeometry(0.24, 0.85, 7)), flameMat);
  flame.position.y = 0.72;
  firePit.add(flame);
  const innerFlame = new THREE.Mesh(trackG(new THREE.ConeGeometry(0.13, 0.52, 6)), trackM(new THREE.MeshStandardMaterial({ color: 0xffd16a, emissive: 0xff8a20, emissiveIntensity: 2.1 })));
  innerFlame.position.y = 0.64;
  firePit.add(innerFlame);
  const fireGlow = new THREE.PointLight(0xff8a3c, 1.7, 8, 2);
  fireGlow.position.set(-10.8, 1.05, 10.1);
  scene.add(fireGlow);

  const logs: Log[] = [];
  for (let i = 0; i < 28; i++) {
    const mesh = new THREE.Mesh(logGeo, logMaterials);
    mesh.rotation.z = Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    logs.push({ x: 0, z: 0, amount: 1, mesh, alive: false, reserved: false });
  }

  function spawnLog(x: number, z: number, amount: number) {
    const slot = logs.find((l) => !l.alive);
    if (!slot) return;
    slot.alive = true;
    slot.reserved = false;
    slot.amount = amount;
    slot.x = x + (Math.random() - 0.5) * 0.4;
    slot.z = z + 0.8;
    slot.mesh.visible = true;
    slot.mesh.position.set(slot.x, 0.16, slot.z);
  }

  function post(x: number, z: number, h = 1.1) {
    const m = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.18, h, 0.18)), woodMat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function rail(x: number, z: number, w: number, d: number) {
    const m = new THREE.Mesh(trackG(new THREE.BoxGeometry(w, 0.12, d)), woodMat);
    m.position.set(x, 0.72, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  for (const [x, z] of [
    [-3.2, 8.4],
    [3.2, 8.4],
    [-3.2, 15.2],
    [3.2, 15.2],
  ] as const) {
    post(x, z, 1.15);
  }
  rail(0, 8.4, 6.4, 0.12);
  rail(0, 15.2, 6.4, 0.12);
  rail(-3.2, 11.8, 0.12, 6.6);
  rail(3.2, 11.8, 0.12, 6.6);

  const stackRoot = new THREE.Group();
  scene.add(stackRoot);
  const stackLogs: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(logGeo, logMaterials);
    m.rotation.z = Math.PI / 2;
    m.rotation.y = i % 2 ? 0.15 : -0.2;
    m.visible = false;
    stackRoot.add(m);
    stackLogs.push(m);
  }

  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 256;
  boardCanvas.height = 128;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    trackG(new THREE.PlaneGeometry(1.5, 0.75)),
    trackM(new THREE.MeshBasicMaterial({ map: boardTex })),
  );
  board.position.set(0, 1.25, 8.15);
  scene.add(board);
  let boardKey = "";
  function paintBoard() {
    const cap = stockCap();
    const key = `${Math.floor(stock)}/${cap}`;
    if (key === boardKey) return;
    boardKey = key;
    const g = boardCanvas.getContext("2d");
    if (!g) return;
    g.fillStyle = "#f4ecdc";
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = "#6d452c";
    g.lineWidth = 10;
    g.strokeRect(8, 8, 240, 112);
    g.fillStyle = "#6d452c";
    g.font = "600 26px Georgia";
    g.fillText("LOGS", 86, 40);
    g.font = "700 48px Georgia";
    g.fillStyle = "#1c2a22";
    g.fillText(key, 48, 98);
    boardTex.needsUpdate = true;
  }

  const gate = new THREE.Group();
  scene.add(gate);
  const gateLogL = new THREE.Mesh(logGeo, woodMat);
  gateLogL.rotation.z = Math.PI / 2;
  gateLogL.scale.set(2.4, 1.4, 1.4);
  gateLogL.position.set(-1.1, 0.45, -30);
  const gateLogR = gateLogL.clone();
  gateLogR.position.x = 1.1;
  gate.add(gateLogL, gateLogR);

  const cabinRoot = new THREE.Group();
  cabinRoot.position.set(-14, 0, 13);
  scene.add(cabinRoot);
  const cabinParts: THREE.Object3D[] = [];
  function cabinBox(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, stage: number) {
    const m = new THREE.Mesh(trackG(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.visible = false;
    m.userData.stage = stage;
    cabinRoot.add(m);
    cabinParts.push(m);
    return m;
  }
  cabinBox(4.2, 0.18, 3.4, 0, 0.1, 0, dirtMat, 1);
  cabinBox(4.2, 1.3, 0.16, 0, 0.8, -1.6, woodMat, 1);
  cabinBox(0.16, 1.3, 3.2, -2, 0.8, 0, woodMat, 2);
  cabinBox(0.16, 1.3, 3.2, 2, 0.8, 0, woodMat, 2);
  cabinBox(4.2, 1.3, 0.16, 0, 0.8, 1.6, woodMat, 2);
  const roof = cabinBox(4.8, 0.18, 3.9, 0, 1.7, 0, hatMat, 3);
  roof.rotation.x = 0;
  const chimney = cabinBox(0.4, 0.9, 0.4, 1.3, 2.15, -0.8, stumpMat, 3);
  void chimney;
  const glowWin = new THREE.Mesh(
    trackG(new THREE.PlaneGeometry(0.55, 0.45)),
    trackM(new THREE.MeshBasicMaterial({ color: 0xffc56b })),
  );
  glowWin.position.set(0, 0.95, 1.7);
  glowWin.visible = false;
  glowWin.userData.stage = 3;
  cabinRoot.add(glowWin);
  cabinParts.push(glowWin);


  // A welcoming timber-yard sign gives the entrance a clear landmark.
  const signRoot = new THREE.Group();
  signRoot.position.set(0, 0, 7.45);
  scene.add(signRoot);
  const signPostGeo = trackG(new THREE.BoxGeometry(0.16, 1.8, 0.16));
  const signPostMat = trackM(new THREE.MeshStandardMaterial({ color: 0x68452b, map: plankTex, roughness: 0.92 }));
  for (const x of [-1.25, 1.25]) {
    const post = new THREE.Mesh(signPostGeo, signPostMat);
    post.position.set(x, 0.9, 0);
    post.castShadow = true;
    signRoot.add(post);
  }
  const signBoard = new THREE.Mesh(
    trackG(new THREE.BoxGeometry(3.1, 0.78, 0.16)),
    trackM(new THREE.MeshStandardMaterial({ color: 0xffffff, map: plankTex, roughness: 0.9 })),
  );
  signBoard.position.y = 1.55;
  signBoard.castShadow = true;
  signRoot.add(signBoard);
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 512; signCanvas.height = 128;
  const signCtx = signCanvas.getContext("2d");
  if (signCtx) {
    signCtx.fillStyle = "#59391f"; signCtx.fillRect(0, 0, 512, 128);
    signCtx.strokeStyle = "#e7bd79"; signCtx.lineWidth = 7; signCtx.strokeRect(9, 9, 494, 110);
    signCtx.fillStyle = "#f5dfac"; signCtx.textAlign = "center"; signCtx.textBaseline = "middle";
    signCtx.font = "bold 58px Georgia"; signCtx.fillText("PINEFOLD", 256, 63);
  }
  const signTex = trackT(new THREE.CanvasTexture(signCanvas));
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signFace = new THREE.Mesh(
    trackG(new THREE.PlaneGeometry(2.88, 0.62)),
    trackM(new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false })),
  );
  signFace.position.set(0, 1.55, 0.091);
  signRoot.add(signFace);

  // Small camp furnishings make the yard feel lived-in without adding heavy geometry.
  const benchRoot = new THREE.Group();
  benchRoot.position.set(-9.6, 0, 7.1);
  benchRoot.rotation.y = -0.22;
  scene.add(benchRoot);
  const benchWood = trackM(new THREE.MeshStandardMaterial({ color: 0xb9824d, map: plankTex, roughness: 0.91 }));
  const benchLegGeo = trackG(new THREE.BoxGeometry(0.12, 0.52, 0.12));
  for (const x of [-0.72, 0.72]) {
    const leg = new THREE.Mesh(benchLegGeo, benchWood);
    leg.position.set(x, 0.26, 0); leg.castShadow = true; benchRoot.add(leg);
  }
  const benchSeat = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.75, 0.13, 0.48)), benchWood);
  benchSeat.position.y = 0.55; benchSeat.castShadow = true; benchRoot.add(benchSeat);
  const benchBack = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.75, 0.48, 0.1)), benchWood);
  benchBack.position.set(0, 0.83, -0.2); benchBack.castShadow = true; benchRoot.add(benchBack);

  const crateMat = trackM(new THREE.MeshStandardMaterial({ color: 0x9b6b3e, map: plankTex, roughness: 0.94 }));
  for (const [x, z, scale] of [[9.3, 9.6, 0.8], [9.8, 9.6, 0.8], [9.55, 10.25, 0.8]] as const) {
    const crate = new THREE.Group();
    crate.position.set(x, 0, z);
    const body = new THREE.Mesh(trackG(new THREE.BoxGeometry(scale, scale, scale)), crateMat);
    body.position.y = scale / 2; body.castShadow = true; body.receiveShadow = true; crate.add(body);
    const bandMat = trackM(new THREE.MeshStandardMaterial({ color: 0x654126, roughness: 0.95 }));
    for (const y of [0.2, 0.6]) {
      const band = new THREE.Mesh(trackG(new THREE.BoxGeometry(scale + 0.025, 0.055, scale + 0.025)), bandMat);
      band.position.y = y * scale; crate.add(band);
    }
    scene.add(crate);
  }

  // Two warm lanterns frame the cabin path and softly brighten the camp at night-like settings.
  const lanternMat = trackM(new THREE.MeshStandardMaterial({ color: 0xffc66b, emissive: 0xff8a2c, emissiveIntensity: 1.4, roughness: 0.35 }));
  const lanternFrameMat = trackM(new THREE.MeshStandardMaterial({ color: 0x49301d, metalness: 0.25, roughness: 0.8 }));
  const lanternLights: THREE.PointLight[] = [];
  for (const [x, z] of [[-11.8, 9.8], [-16.2, 9.8]] as const) {
    const lantern = new THREE.Group();
    lantern.position.set(x, 1.65, z);
    scene.add(lantern);
    const glow = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.22, 0.3, 0.22)), lanternMat);
    lantern.add(glow);
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.035, 0.42, 0.035)), lanternFrameMat);
      bar.position.x = side * 0.15; lantern.add(bar);
    }
    const top = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.38, 0.055, 0.34)), lanternFrameMat);
    top.position.y = 0.2; lantern.add(top);
    const light = new THREE.PointLight(0xffb35c, 0.5, 4, 2);
    light.position.set(x, 1.7, z);
    scene.add(light); lanternLights.push(light);
  }

  // Furniture appears as the cabin is completed, rewarding the final cabin upgrade.
  const cabinTable = cabinBox(1.15, 0.12, 0.62, 0.2, 0.62, 0.1, woodMat, 3);
  const cabinTableLegs = [
    cabinBox(0.09, 0.62, 0.09, -0.28, 0.31, -0.12, woodMat, 3),
    cabinBox(0.09, 0.62, 0.09, 0.68, 0.31, -0.12, woodMat, 3),
    cabinBox(0.09, 0.62, 0.09, -0.28, 0.31, 0.32, woodMat, 3),
    cabinBox(0.09, 0.62, 0.09, 0.68, 0.31, 0.32, woodMat, 3),
  ];
  void cabinTable; void cabinTableLegs;
  cabinBox(1.45, 0.22, 0.72, -0.9, 0.32, -0.65, benchWood, 3);
  cabinBox(1.45, 0.12, 0.12, -0.9, 0.5, -0.98, benchWood, 3);

  const sawRoot = new THREE.Group();
  sawRoot.position.set(6.4, 0, 11.2);
  scene.add(sawRoot);
  const sawTop = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.8, 0.12, 0.9)), woodMat);
  sawTop.position.y = 0.7;
  const sawLeg = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.12, 0.7, 0.12)), woodMat);
  sawLeg.position.set(-0.7, 0.35, 0.3);
  const sawLeg2 = sawLeg.clone();
  sawLeg2.position.x = 0.7;
  const blade = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12)), steelMat);
  blade.rotation.x = Math.PI / 2;
  blade.position.y = 0.82;
  sawRoot.add(sawTop, sawLeg, sawLeg2, blade);
  sawRoot.visible = false;

  // Finished boards are stacked beside the sawbench once the sawmill is unlocked.
  const boardStack = new THREE.Group();
  boardStack.position.set(7.75, 0, 11.2);
  scene.add(boardStack);
  const boardMeshes: THREE.Mesh[] = [];
  const boardMat = trackM(new THREE.MeshStandardMaterial({ color: 0xffffff, map: plankTex, roughness: 0.86 }));
  const boardGeo = trackG(new THREE.BoxGeometry(0.92, 0.09, 0.18));
  for (let i = 0; i < 24; i++) {
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.position.set((i % 4) * 0.02, 0.08 + Math.floor(i / 4) * 0.11, (i % 4) * 0.19 - 0.28);
    boardMesh.rotation.y = i % 2 ? 0.025 : -0.025;
    boardMesh.castShadow = true;
    boardMesh.receiveShadow = true;
    boardMesh.visible = false;
    boardStack.add(boardMesh);
    boardMeshes.push(boardMesh);
  }

  const creek = new THREE.Mesh(trackG(new THREE.PlaneGeometry(4.2, 16)), waterMat);
  creek.rotation.x = -Math.PI / 2;
  creek.position.set(22, 0.05, 6);
  scene.add(creek);
  const waterGlints: THREE.Mesh[] = [];
  const glintMat = trackM(new THREE.MeshBasicMaterial({ color: 0xc4f3f0, transparent: true, opacity: 0.24, depthWrite: false }));
  for (let i = 0; i < 8; i++) {
    const glint = new THREE.Mesh(trackG(new THREE.PlaneGeometry(0.28 + rnd() * 0.42, 0.035 + rnd() * 0.035)), glintMat);
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(21.1 + rnd() * 1.8, 0.062, -1.5 + i * 2.0);
    glint.userData.speed = 0.15 + rnd() * 0.25;
    glint.userData.offset = rnd() * Math.PI * 2;
    scene.add(glint);
    waterGlints.push(glint);
  }
  const creekWheel = new THREE.Mesh(trackG(new THREE.TorusGeometry(0.7, 0.08, 6, 14)), woodMat);
  creekWheel.position.set(20.4, 0.9, 6);
  scene.add(creekWheel);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.2, 0.06, 0.06)), woodMat);
    spoke.rotation.z = (i / 4) * Math.PI;
    creekWheel.add(spoke);
  }
  creekWheel.visible = false;

  function person(shirt: THREE.Material, hat: number) {
    const group = new THREE.Group();
    const hip = new THREE.Group();
    hip.position.y = 0.86;
    group.add(hip);
    const torso = new THREE.Mesh(trackG(new THREE.CapsuleGeometry(0.19, 0.24, 3, 8)), shirt);
    torso.position.y = 0.27;
    torso.castShadow = true;
    hip.add(torso);
    const belt = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.37, 0.065, 0.265)), gripMat);
    belt.position.set(0, 0.095, 0);
    const buckle = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.065, 0.052, 0.018)), brassMat);
    buckle.position.set(0, 0.095, 0.142);
    const pouch = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.095, 0.12, 0.06)), woodMat);
    pouch.position.set(-0.145, 0.07, -0.005);
    hip.add(belt, buckle, pouch);
    const head = new THREE.Mesh(trackG(new THREE.SphereGeometry(0.16, 12, 9)), skinMat);
    head.position.y = 0.66;
    head.castShadow = true;
    hip.add(head);
    const eyeMat = trackM(new THREE.MeshStandardMaterial({ color: 0x1c1206, roughness: 0.4 }));
    const eyeL = new THREE.Mesh(trackG(new THREE.SphereGeometry(0.028, 6, 4)), eyeMat);
    eyeL.position.set(0.055, 0.68, 0.13);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.055;
    hip.add(eyeL, eyeR);
    const brim = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.32, 0.32, 0.045, 14)), hatMat);
    brim.position.y = 0.76;
    brim.castShadow = true;
    const crown = new THREE.Mesh(trackG(new THREE.ConeGeometry(0.18, 0.26, 8)), new THREE.MeshStandardMaterial({ color: hat, roughness: 0.7 }));
    mats.add(crown.material as THREE.Material);
    crown.position.y = 0.9;
    crown.castShadow = true;
    hip.add(brim, crown);
    const pack = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.28, 0.32, 0.14)), woodMat);
    pack.position.set(0, 0.28, -0.2);
    pack.castShadow = true;
    hip.add(pack);
    const arm = new THREE.Group();
    arm.position.set(0.28, 0.4, 0);
    const armMesh = new THREE.Mesh(trackG(new THREE.CapsuleGeometry(0.052, 0.24, 2, 7)), shirt);
    armMesh.position.y = -0.16;
    const handle = new THREE.Mesh(trackG(new THREE.CapsuleGeometry(0.032, 0.47, 4, 9)), woodMat);
    handle.position.set(0, -0.285, 0.08);
    handle.rotation.z = -0.035;
    const grip = new THREE.Mesh(trackG(new THREE.CapsuleGeometry(0.039, 0.11, 3, 8)), gripMat);
    grip.position.set(-0.006, -0.425, 0.08);
    const ferrule = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.042, 0.046, 0.075, 10)), steelMat);
    ferrule.position.set(0.012, -0.395, 0.08);
    const axeHead = new THREE.Mesh(axeHeadGeo, steelMat);
    axeHead.position.set(-0.005, -0.48, 0.075);
    axeHead.castShadow = true;
    const axeEdge = new THREE.Mesh(axeEdgeGeo, axeEdgeMat);
    axeEdge.position.set(-0.005, -0.48, 0.155);
    arm.add(armMesh, handle, grip, ferrule, axeHead, axeEdge);
    hip.add(arm);
    function leg(side: number) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.1, -0.02, 0);
      const mesh = new THREE.Mesh(trackG(new THREE.CapsuleGeometry(0.065, 0.68, 3, 8)), pantMat);
      mesh.position.y = -0.37;
      mesh.castShadow = true;
      const boot = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.145, 0.09, 0.22)), bootMat);
      boot.position.set(0, -0.735, 0.055);
      boot.castShadow = true;
      pivot.add(mesh, boot);
      hip.add(pivot);
      return pivot;
    }
    const legL = leg(-1);
    const legR = leg(1);
    const carryMesh = new THREE.Mesh(logGeo, logMaterials);
    carryMesh.rotation.z = Math.PI / 2;
    carryMesh.position.set(0, 0.42, 0.22);
    carryMesh.visible = false;
    hip.add(carryMesh);
    const blob = new THREE.Mesh(
      trackG(new THREE.CircleGeometry(0.38, 12)),
      trackM(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    group.add(blob);
    return { group, legL, legR, arm, carryMesh, axeHead, axeEdge };
  }

  const shirtHands = [0xc4552a, 0x2f6b45, 0x7a4a8a, 0xb08930].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, map: fabricTex, roughness: 0.82 }),
  );
  for (const m of shirtHands) mats.add(m);

  const hero = person(shirtMat, 0xc4552a);
  scene.add(hero.group);
  hero.group.scale.setScalar(1.18);
  const player = { x: 0, z: 6.2, vx: 0, vz: 0, yaw: 0 };

  const crew: Hand[] = [];
  function syncCrew() {
    while (crew.length < hands) {
      const body = person(shirtHands[crew.length % shirtHands.length]!, 0x3d6fbf);
      scene.add(body.group);
      const spot = crew.length;
      crew.push({
        x: -2 - spot,
        z: 10,
        vx: 0,
        vz: 0,
        group: body.group,
        legL: body.legL,
        legR: body.legR,
        arm: body.arm,
        carryMesh: body.carryMesh,
        state: "seek",
        tree: null,
        carry: 0,
        chopT: 0,
        stuck: 0,
        phase: spot,
      });
    }
  }
  syncCrew();

  function pineYield() {
    return 1 + Math.floor((axe - 1) / 2);
  }
  function yieldOf(kind: "pine" | "hard") {
    return kind === "hard" ? pineYield() + 2 : pineYield();
  }
  function packCap() {
    return PACK_CAP[packLv] ?? 6;
  }
  function stockCap() {
    return 24 + cabin * 10 + (saw ? 8 : 0);
  }
  function sellPrice() {
    const house = [1, 1.12, 1.28, 1.5][cabin] ?? 1;
    return 4 * (saw ? 2.15 : 1) * house * (wheel ? 1.1 : 1);
  }
  function sellEvery() {
    return wheel ? 0.8 : 1.65;
  }

  function say(text: string) {
    banner = text;
    bannerT = 2.6;
  }
  function burst(text: string) {
    popN += 1;
    pop = { n: popN, text };
  }

  function applyOffline() {
    const elapsed = Math.min(4 * 3600, Math.max(0, (Date.now() - lastAt) / 1000));
    lastAt = Date.now();
    if (elapsed < 20 || hands < 1) return;
    const per = hands * (0.12 + axe * 0.02) * (north ? 1.35 : 1);
    const brought = per * elapsed;
    const room = Math.max(0, stockCap() - stock);
    stock += Math.min(room, brought);
    const sold = Math.min(stock, (1 / sellEvery()) * elapsed);
    stock -= sold;
    const gain = Math.floor(sold * sellPrice() * 0.65);
    if (gain > 0) {
      coins += gain;
      offlineNote = `While you were away  +${gain}`;
      say(offlineNote);
    }
  }

  function persist() {
    const data: Save = {
      v: 1,
      coins,
      stock,
      axe,
      packLv,
      hands,
      saw,
      north,
      cabin,
      wheel,
      dumped,
      muted,
      lastAt: Date.now(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* quota */
    }
  }

  function treeOpen(t: Tree) {
    if (t.kind === "hard" && !north) return false;
    return t.state === "up";
  }

  function nearestTree(x: number, z: number, maxDist: number) {
    let best: Tree | null = null;
    let d0 = maxDist;
    for (const t of trees) {
      if (!treeOpen(t)) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < d0) {
        d0 = d;
        best = t;
      }
    }
    return best;
  }

  function fell(t: Tree) {
    t.state = "fall";
    t.fall = 0;
    t.hp = 0;
    audio.kill();
  }

  const bits: Array<{ mesh: THREE.Mesh; life: number; vx: number; vy: number; vz: number }> = [];
  const bitGeo = trackG(new THREE.TetrahedronGeometry(0.065, 0));
  const bitMat = trackM(new THREE.MeshStandardMaterial({ color: 0xc4a06a, roughness: 0.72, flatShading: true }));
  for (let i = 0; i < 26; i++) {
    const mesh = new THREE.Mesh(bitGeo, bitMat);
    mesh.visible = false;
    scene.add(mesh);
    bits.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  function puff(x: number, z: number) {
    for (let n = 0; n < 7; n++) {
      const bit = bits.find((b) => b.life <= 0);
      if (!bit) return;
      bit.life = 0.45;
      bit.mesh.visible = true;
      bit.mesh.position.set(x + (Math.random() - 0.5) * 0.5, 1.45 + Math.random() * 0.25, z + (Math.random() - 0.5) * 0.38);
      bit.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const chipScale = 0.65 + Math.random() * 1.2;
      bit.mesh.scale.set(chipScale, chipScale * (0.7 + Math.random() * 0.8), chipScale);
      bit.vx = (Math.random() - 0.5) * 3.2;
      bit.vy = 1.8 + Math.random() * 1.6;
      bit.vz = (Math.random() - 0.5) * 3.2;
    }
  }

  function chopAt(t: Tree, power: number) {
    if (!treeOpen(t)) return;
    t.hp -= power;
    t.upper.rotation.z = (Math.random() - 0.5) * 0.12;
    audio.hit();
    puff(t.x, t.z);
    if (t.hp <= 0) fell(t);
  }

  const circles: Array<{ x: number; z: number; r: number }> = [];
  function blocked(x: number, z: number, r: number) {
    if (x < -27 || x > 26 || z > 20 || z < -52) return true;
    if (!north && z < -29.2 && Math.abs(x) < 3.2) return true;
    if (!north && z < -31) return true;
    for (const t of trees) {
      if (t.state === "stump") continue;
      if (Math.hypot(x - t.x, z - t.z) < r + 0.55) return true;
    }
    for (const c of circles) {
      if (Math.hypot(x - c.x, z - c.z) < r + c.r) return true;
    }
    return false;
  }
  function moveBody(x: number, z: number, nx: number, nz: number, r: number) {
    let x1 = nx;
    let z1 = nz;
    if (blocked(x1, z, r)) x1 = x;
    if (blocked(x1, z1, r)) z1 = z;
    if (blocked(x1, z1, r)) return { x, z };
    return { x: x1, z: z1 };
  }

  function inYard(x: number, z: number) {
    return Math.abs(x) < 2.7 && z > 8.8 && z < 14.8;
  }

  function dumpPack() {
    if (pack <= 0) return;
    const room = stockCap() - stock;
    if (room <= 0) {
      say("Yard is full");
      return;
    }
    const take = Math.min(pack, room);
    pack -= take;
    stock += take;
    dumped += take;
    audio.pickup();
    say(`Dumped ${take}`);
    hero.carryMesh.visible = pack > 0;
  }

  function tryPickup(x: number, z: number, capLeft: number) {
    if (capLeft <= 0) return 0;
    let got = 0;
    for (const log of logs) {
      if (!log.alive || log.reserved) continue;
      if (Math.hypot(log.x - x, log.z - z) > 1.35) continue;
      if (got + log.amount > capLeft) continue;
      log.alive = false;
      log.mesh.visible = false;
      got += log.amount;
      audio.pickup();
      if (got >= capLeft) break;
    }
    return got;
  }

  let phase: Phase = "menu";
  let yawWant = 0;
  const keys = new Set<string>();
  let probeKeys: Set<string> | null = null;
  let probeAttack: boolean | null = null;
  let attackMouse = false;

  function held(code: string) {
    return probeKeys ? probeKeys.has(code) : keys.has(code);
  }

  function goalText() {
    if (dumped < 1) return "Chop a tree, pick up the log, dump it in the yard.";
    if (hands < 1) return "Hire a hand. They keep cutting while you walk.";
    if (!saw) return "Build the sawbench. Planks pay more than raw logs.";
    if (!north) return "Open the north stand. Hardwood is worth more.";
    if (cabin < 3) return "Raise the cabin. A finished roof pays better, even away.";
    if (!wheel) return "Set the creek wheel so the yard sells twice as fast.";
    return "The camp runs. Cut the stand when the yard runs low.";
  }

  function lockOf(id: UpgradeId): string | null {
    if (id === "saw" && dumped < 6) return "Dump 6 logs first";
    if (id === "north" && !saw) return "Build the sawbench first";
    if (id === "cabin" && hands < 1) return "Hire a hand first";
    if (id === "wheel" && (!north || cabin < 2)) return "Open the stand and raise the cabin";
    return null;
  }

  function costOf(id: UpgradeId): number | null {
    if (id === "axe") return axe >= 5 ? null : (AXE_COST[axe] ?? null);
    if (id === "pack") return packLv >= 3 ? null : (PACK_COST[packLv + 1] ?? null);
    if (id === "hand") return hands >= 4 ? null : (HAND_COST[hands] ?? null);
    if (id === "saw") return saw ? null : 80;
    if (id === "north") return north ? null : 200;
    if (id === "cabin") return cabin >= 3 ? null : (CABIN_COST[cabin] ?? null);
    if (id === "wheel") return wheel ? null : 900;
    return null;
  }

  function buy(id: UpgradeId) {
    if (phase !== "playing") return;
    const lock = lockOf(id);
    if (lock) {
      say(lock);
      return;
    }
    const cost = costOf(id);
    if (cost == null) return;
    if (coins < cost) {
      say(`Need ${cost} coins`);
      return;
    }
    coins -= cost;
    if (id === "axe") axe += 1;
    if (id === "pack") packLv += 1;
    if (id === "hand") {
      hands += 1;
      syncCrew();
    }
    if (id === "saw") saw = true;
    if (id === "north") north = true;
    if (id === "cabin") cabin += 1;
    if (id === "wheel") wheel = true;
    audio.wave();
    say("Bought");
    persist();
  }

  function refreshProps() {
    sawRoot.visible = saw;
    boardStack.visible = saw;
    const visibleBoards = saw ? Math.min(boardMeshes.length, Math.ceil(stock * 0.75)) : 0;
    boardMeshes.forEach((m, i) => { m.visible = i < visibleBoards; });
    const bladeScale = 0.92 + Math.max(0, axe - 1) * 0.06;
    hero.axeHead.scale.set(bladeScale, bladeScale, 1);
    hero.axeEdge.scale.set(bladeScale, bladeScale, 1);
    hero.axeHead.material = axe >= 5 ? axeLegendMat : axe >= 3 ? axePolishedMat : steelMat;
    creekWheel.visible = wheel;
    const cap = stockCap();
    const shown = Math.min(stackLogs.length, Math.ceil((stock / Math.max(1, cap)) * stackLogs.length));
    stackLogs.forEach((m, i) => {
      m.visible = i < shown && stock > 0;
      const col = i % 4;
      const row = Math.floor(i / 4);
      m.position.set(-1.1 + col * 0.7, 0.2 + row * 0.22, 11.6);
    });
    for (const p of cabinParts) p.visible = cabin >= (p.userData.stage as number);
    windowLight.intensity = cabin >= 3 ? 6 : 0;
    paintBoard();
  }

  function simulate(dt: number) {
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) banner = "";
    }
    for (const bit of bits) {
      if (bit.life <= 0) continue;
      bit.life -= dt;
      bit.vy -= dt * 9;
      bit.mesh.position.x += bit.vx * dt;
      bit.mesh.position.y = Math.max(0.05, bit.mesh.position.y + bit.vy * dt);
      bit.mesh.position.z += bit.vz * dt;
      if (bit.life <= 0) bit.mesh.visible = false;
    }
    if (phase !== "playing") return;

    sellAcc += dt;
    const every = sellEvery();
    while (sellAcc >= every && stock > 0) {
      sellAcc -= every;
      stock -= 1;
      const gain = sellPrice();
      coins += gain;
      burst(`+${Math.floor(gain)}`);
    }

    let mx = (held("KeyD") || held("ArrowRight") ? 1 : 0) - (held("KeyA") || held("ArrowLeft") ? 1 : 0);
    let my = (held("KeyW") || held("ArrowUp") ? 1 : 0) - (held("KeyS") || held("ArrowDown") ? 1 : 0);
    mx += touch.moveX;
    my += touch.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const speed = mag > 0.08 ? 7.1 : 0;
    const wishX = mx * speed;
    const wishZ = -my * speed;
    const velocityBlend = 1 - Math.exp(-14 * dt);
    player.vx += (wishX - player.vx) * velocityBlend;
    player.vz += (wishZ - player.vz) * velocityBlend;
    const next = moveBody(player.x, player.z, player.x + player.vx * dt, player.z + player.vz * dt, 0.34);
    player.x = next.x;
    player.z = next.z;
    if (Math.hypot(player.vx, player.vz) > 0.4) {
      yawWant = Math.atan2(-player.vx, -player.vz);
      let d = yawWant - player.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      player.yaw += d * (1 - Math.exp(-12 * dt));
      bob += dt * (7.5 + Math.hypot(player.vx, player.vz) * 0.35);
      stepT -= dt;
      if (stepT <= 0) {
        stepT = 0.38;
        audio.step();
      }
    }

    const attacking = (probeAttack !== null ? probeAttack : attackMouse || touch.attack) || held("Space");
    chopCd = Math.max(0, chopCd - dt);
    if (attacking && chopCd <= 0) {
      const t = nearestTree(player.x, player.z, 2.35);
      if (t) {
        chopCd = Math.max(0.16, 0.3 - axe * 0.03);
        chopAt(t, axe >= 4 ? 2 : 1);
        hero.arm.rotation.x = -1.48;
        hero.arm.rotation.z = 0.16;
      }
    }
    hero.arm.rotation.x += (0.12 - hero.arm.rotation.x) * (1 - Math.exp(-8.5 * dt));
    hero.arm.rotation.z += (0 - hero.arm.rotation.z) * (1 - Math.exp(-7 * dt));

    if (pack < packCap()) {
      const got = tryPickup(player.x, player.z, packCap() - pack);
      if (got > 0) {
        pack += got;
        burst(`+${got} log`);
      }
    } else if (logs.some((l) => l.alive && Math.hypot(l.x - player.x, l.z - player.z) < 1.35)) {
      say("Pack is full");
    }
    if (inYard(player.x, player.z)) dumpPack();
    hero.carryMesh.visible = pack > 0;

    for (const hand of crew) {
      hand.phase += dt * 8;
      if (hand.carry > 0) {
        // With the sawbench built, crew haul timber to the mill instead of the raw-log yard.
        const tx = saw ? 6.4 : 0;
        const tz = saw ? 11.2 : 11.5;
        hand.state = saw ? "mill" : "haul";
        stepToward(hand, tx, tz, 4.3 * dt);
        if (Math.hypot(hand.x - tx, hand.z - tz) < 1.3) {
          const room = stockCap() - stock;
          if (room > 0) {
            const take = Math.min(hand.carry, room);
            stock += take;
            dumped += take;
            hand.carry -= take;
            audio.pickup();
            if (saw) say("Fresh boards stacked!");
          }
        }
      } else if (hand.tree && treeOpen(hand.tree)) {
        hand.state = "chop";
        const t = hand.tree;
        stepToward(hand, t.x, t.z + 1.15, 4.3 * dt);
        if (Math.hypot(hand.x - t.x, hand.z - t.z) < 2.15) {
          hand.chopT -= dt;
          hand.arm.rotation.x = Math.sin(hand.phase * 1.4) * 0.8;
          if (hand.chopT <= 0) {
            hand.chopT = 0.55;
            chopAt(t, 1);
          }
        }
      } else {
        hand.state = "seek";
        hand.tree = nearestTree(hand.x, hand.z, 40) ?? null;
        if (!hand.tree) stepToward(hand, 0, 10, 3 * dt);
      }
      const loose = logs.find((l) => l.alive && !l.reserved && Math.hypot(l.x - hand.x, l.z - hand.z) < 1.4);
      if (hand.carry <= 0 && loose) {
        loose.alive = false;
        loose.mesh.visible = false;
        hand.carry = loose.amount;
        hand.tree = null;
      }
      hand.carryMesh.visible = hand.carry > 0;
      const moving = Math.hypot(hand.vx, hand.vz) > 0.2;
      const swing = moving ? Math.sin(hand.phase) * 0.72 : Math.sin(hand.phase * 0.4) * 0.025;
      if (hand.state === "mill" && hand.carry > 0) {
        // A short, readable sawing motion while the worker unloads at the bench.
        hand.arm.rotation.x = Math.sin(hand.phase * 2.8) * 0.48 - 0.25;
      }
      hand.legL.rotation.x = swing;
      hand.legR.rotation.x = -swing;
      if (hand.state !== "chop") {
        hand.arm.rotation.x += (0.1 - hand.arm.rotation.x) * (1 - Math.exp(-8 * dt));
        hand.arm.rotation.z += (0 - hand.arm.rotation.z) * (1 - Math.exp(-7 * dt));
      }
      hand.group.position.set(hand.x, moving ? Math.abs(Math.sin(hand.phase * 2)) * 0.025 : 0, hand.z);
      hand.group.rotation.z = moving ? Math.sin(hand.phase) * 0.018 : 0;
      if (Math.hypot(hand.vx, hand.vz) > 0.2) hand.group.rotation.y = Math.atan2(-hand.vx, -hand.vz);
    }

    for (const t of trees) {
      if (t.state === "up") {
        t.upper.rotation.z *= Math.exp(-4 * dt);
        if (!reduceMotion) {
          const wind = Math.sin(performance.now() * 0.0008 + t.sway) * 0.028;
          t.upper.rotation.y = wind;
          t.upper.rotation.z += Math.sin(performance.now() * 0.00055 + t.sway) * 0.0008;
        } else {
          t.upper.rotation.y = 0;
        }
      } else if (t.state === "fall") {
        t.fall += dt;
        const u = Math.min(1, t.fall / 0.56);
        const easedFall = 1 - Math.pow(1 - u, 2.2);
        t.upper.rotation.x = easedFall * 1.35;
        t.upper.rotation.z = Math.sin(u * Math.PI) * 0.08;
        if (t.fall >= 0.45) {
          t.state = "stump";
          t.upper.visible = false;
          t.respawn = t.kind === "hard" ? 28 : 16;
          spawnLog(t.x, t.z, yieldOf(t.kind));
        }
      } else {
        t.respawn -= dt;
        if (t.respawn <= 0) {
          t.state = "up";
          t.hp = t.max;
          t.upper.visible = true;
          t.upper.rotation.x = 0;
          t.upper.rotation.z = 0;
          t.upper.rotation.y = 0;
          t.upper.scale.setScalar(0.2);
          t.growing = true;
        }
      }
      if (t.growing) {
        const s = Math.min(1, t.upper.scale.x + dt * 0.85);
        t.upper.scale.setScalar(s);
        if (s >= 1) t.growing = false;
      }
    }

    saveAcc += dt;
    if (saveAcc > 2.5) {
      saveAcc = 0;
      lastAt = Date.now();
      persist();
    }
    refreshProps();
    if (saw && stock > 0) blade.rotation.z += dt * 8;
    if (creekWheel.visible) creekWheel.rotation.z += dt * (stock > 0 ? 1.4 : 0.2);
    for (const glint of waterGlints) {
      if (!reduceMotion) {
        glint.position.z += dt * (glint.userData.speed as number);
        if (glint.position.z > 14) glint.position.z = -2;
        glintMat.opacity = 0.12 + (Math.sin(performance.now() * 0.0014 + (glint.userData.offset as number)) + 1) * 0.08;
      }
    }
  }

  function stepToward(hand: Hand, tx: number, tz: number, dist: number) {
    const dx = tx - hand.x;
    const dz = tz - hand.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = hand.x + (dx / len) * dist;
    const nz = hand.z + (dz / len) * dist;
    const moved = moveBody(hand.x, hand.z, nx, nz, 0.3);
    const progressed = Math.hypot(moved.x - hand.x, moved.z - hand.z);
    hand.x = moved.x;
    hand.z = moved.z;
    hand.vx = (moved.x - (nx - (dx / len) * dist)) / Math.max(STEP, 0.016);
    hand.vx = dx / len;
    hand.vz = dz / len;
    if (progressed < dist * 0.25) {
      hand.stuck += 1;
      if (hand.stuck > 20) {
        hand.tree = null;
        hand.stuck = 0;
        hand.x += (Math.random() - 0.5) * 0.8;
      }
    } else hand.stuck = 0;
  }

  function snap(): Snap {
    const locks: Snap["lock"] = {};
    for (const id of ["axe", "pack", "hand", "saw", "north", "cabin", "wheel"] as const) {
      const text = lockOf(id);
      if (text) locks[id] = text;
    }
    const price = sellPrice();
    return {
      coins: Math.floor(coins),
      pack,
      packCap: packCap(),
      stock: Math.floor(stock),
      stockCap: stockCap(),
      price: Math.round(price),
      rate: stock > 0 ? price / sellEvery() : 0,
      axe,
      axeCost: costOf("axe"),
      packLv,
      packCost: costOf("pack"),
      hands,
      handCost: costOf("hand"),
      saw,
      sawCost: costOf("saw"),
      north,
      northCost: costOf("north"),
      cabin,
      cabinCost: costOf("cabin"),
      wheel,
      wheelCost: costOf("wheel"),
      goal: goalText(),
      banner,
      pop,
      lock: locks,
    };
  }

  let menuT = 0;
  function render(dt: number) {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const isMoving = Math.hypot(player.vx, player.vz) > 0.2;
    const swing = isMoving ? Math.sin(bob) * 0.65 : Math.sin(performance.now() * 0.0014) * 0.025;
    hero.legL.rotation.x = swing;
    hero.legR.rotation.x = -swing;
    hero.group.position.set(player.x, isMoving ? Math.abs(Math.sin(bob * 2)) * 0.04 : Math.sin(performance.now() * 0.0013) * 0.012, player.z);
    hero.group.rotation.y = player.yaw;
    hero.group.rotation.z = isMoving ? Math.sin(bob) * 0.028 : 0;
    const camTarget = new THREE.Vector3();
    if (phase === "menu") {
      menuT += dt;
      const ang = menuT * 0.15;
      camera.position.set(Math.sin(ang) * 16, 18, 12 + Math.cos(ang) * 10);
      camTarget.set(0, 0.5, 4);
    } else {
      // Pointer/touch drag deltas are consumed once per frame for a smooth orbit camera.
      cameraYaw -= touch.lookX * 0.006;
      cameraPitch = clamp(cameraPitch + touch.lookY * 0.005, -0.2, 0.65);
      touch.lookX = 0;
      touch.lookY = 0;
      const horizontal = cameraDistance * Math.cos(cameraPitch);
      const height = cameraDistance * (1.1 + Math.sin(cameraPitch));
      const want = new THREE.Vector3(
        player.x + Math.sin(cameraYaw) * horizontal,
        height,
        player.z + Math.cos(cameraYaw) * horizontal,
      );
      if (camera.position.y < 2) camera.position.copy(want);
      camera.position.lerp(want, 1 - Math.exp(-7 * dt));
      camTarget.set(player.x, 0.8, player.z - 0.4);
    }
    camera.lookAt(camTarget);
    const focus = phase === "menu" ? 4 : player.z;
    const focusX = phase === "menu" ? 0 : player.x;
    sun.position.set(focusX + 12, 22, focus + 8);
    sun.target.position.set(focusX, 0, focus);
    renderer.render(scene, camera);
  }

  let acc = 0;
  let last = performance.now();
  let raf = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      simulate(STEP);
      acc -= STEP;
      steps++;
    }
    render(dt);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const pixelCap = graphicsQuality === "high" ? (w < 900 ? 1.6 : 2) : graphicsQuality === "balanced" ? (w < 900 ? 1.25 : 1.5) : 0.95;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
    renderer.shadowMap.enabled = graphicsQuality !== "performance";
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  const ac = new AbortController();
  const opt: AddEventListenerOptions = { signal: ac.signal };
  const GAME = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
  window.addEventListener(
    "keydown",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (GAME.has(e.code)) e.preventDefault();
      keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "Escape" && phase === "playing") setPhase("paused");
    },
    opt,
  );
  window.addEventListener("keyup", (e) => keys.delete(e.code), opt);
  window.addEventListener(
    "blur",
    () => {
      keys.clear();
      attackMouse = false;
    },
    opt,
  );
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      attackMouse = true;
    },
    opt,
  );
  window.addEventListener(
    "pointerup",
    () => {
      attackMouse = false;
    },
    opt,
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        lastAt = Date.now();
        persist();
      } else if (phase === "playing") {
        applyOffline();
        audio.resume();
      }
    },
    opt,
  );

  function setPhase(next: Phase) {
    phase = next;
    hooks.onPhase(next);
  }

  function begin() {
    audio.unlock();
    applyOffline();
    pack = 0;
    player.x = 0;
    player.z = 6.2;
    player.vx = 0;
    player.vz = 0;
    setPhase("playing");
    persist();
  }

  refreshProps();
  paintBoard();

  const probe: ControlsProbe = {
    getYaw: () => player.yaw,
    getSpeed: () => Math.hypot(player.vx, player.vz),
    getPos: () => ({ x: player.x, y: 0, z: player.z }),
    setKeys: (codes) => {
      probeKeys = codes.length ? new Set(codes) : null;
      if (probeKeys && phase !== "playing") begin();
    },
    setAttack: (on) => {
      probeAttack = on ? true : null;
      if (on && phase !== "playing") begin();
    },
    getMag: () => pack,
    getPhase: () => phase,
    setPos: (x, z) => {
      player.x = x;
      player.z = z;
    },
    setYaw: (y) => {
      player.yaw = y;
    },
  };
  window.__controlsTest = probe;
  window.__saltReady = true;
  hooks.onReady({ muted });
  hooks.onPhase("menu");
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ac.abort();
      ro.disconnect();
      audio.close();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      boardTex.dispose();
      renderer.dispose();
      for (const texture of textures) texture.dispose();
      delete window.__controlsTest;
      delete window.__saltReady;
    },
    start() {
      if (phase === "playing") return;
      begin();
    },
    pause() {
      if (phase === "playing") setPhase("paused");
    },
    resume() {
      if (phase !== "paused") return;
      audio.resume();
      setPhase("playing");
    },
    title() {
      persist();
      keys.clear();
      setPhase("menu");
    },
    setMuted(next) {
      muted = next;
      audio.setMuted(next);
      persist();
    },
    setGraphicsQuality(next) {
      graphicsQuality = next;
      sun.shadow.mapSize.set(next === "high" ? 2048 : next === "balanced" ? 1024 : 512, next === "high" ? 2048 : next === "balanced" ? 1024 : 512);
      sun.shadow.needsUpdate = true;
      resize();
    },
    setCameraDistance(distance) {
      cameraDistance = clamp(distance, 6, 12);
    },
    setReducedMotion(reduced) {
      reduceMotion = reduced;
      if (reduced) {
        for (const tree of trees) {
          if (tree.state === "up") {
            tree.upper.rotation.y = 0;
            tree.upper.rotation.z = 0;
          }
        }
      }
    },
    buy,
    snap,
  };
}
