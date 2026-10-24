export type Phase = "menu" | "playing" | "paused" | "dead";

export type TouchInput = {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  attack: boolean;
  reload: boolean;
  use: boolean;
  melee: boolean;
};

export type HudTarget = {
  score: HTMLElement | null;
  wave: HTMLElement | null;
  enemies: HTMLElement | null;
  healthBar: HTMLElement | null;
  healthNum: HTMLElement | null;
  mag: HTMLElement | null;
  reserve: HTMLElement | null;
  crosshair: HTMLElement | null;
  vignette: HTMLElement | null;
  banner: HTMLElement | null;
  reloadLabel: HTMLElement | null;
  hit: HTMLElement | null;
  barge: HTMLElement | null;
  weapon: HTMLElement | null;
  prompt: HTMLElement | null;
};

export type RunStats = {
  score: number;
  wave: number;
  best: number;
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getPos: () => { x: number; y: number; z: number };
  /** Held physical keys until the next call. Empty array releases the override. */
  setKeys: (codes: string[]) => void;
  /** Force fire on, or pass false to release the override. */
  setAttack: (on: boolean) => void;
  getMag: () => number;
  getPhase: () => Phase;
  setScore?: (n: number) => void;
  setPos?: (x: number, z: number) => void;
  setYaw?: (yaw: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
    __saltReady?: boolean;
  }
}

export type GameHooks = {
  onPhase: (phase: Phase, stats: RunStats) => void;
  onReady: (meta: { best: number; muted: boolean; sens: number }) => void;
  onError: (message: string) => void;
};

export type GameApi = {
  dispose: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  title: () => void;
  requestLock: () => void;
  setMuted: (muted: boolean) => void;
  setSens: (sens: number) => void;
};
