export type GameAudio = {
  unlock: () => void;
  resume: () => void;
  setMuted: (muted: boolean) => void;
  shot: () => void;
  dry: () => void;
  hit: () => void;
  hurt: () => void;
  kill: () => void;
  reload: () => void;
  wave: () => void;
  pickup: () => void;
  step: () => void;
  close: () => void;
};

export function createAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let music: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = false;
  const drones: OscillatorNode[] = [];

  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    music = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    sfx.gain.value = 0.85;
    music.gain.value = 0.5;
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.25);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.65 + white * 0.35;
      data[i] = last;
    }
    return ctx;
  }

  function startDrone() {
    if (!ctx || !music || drones.length) return;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    filter.connect(gain);
    gain.connect(music);
    for (const freq of [49, 73.5, 98]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(filter);
      o.start();
      drones.push(o);
    }
  }

  function burst(freq: number, q: number, dur: number, gain: number, rate = 1) {
    if (!ctx || !sfx || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfx);
    src.start();
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slide = 0) {
    if (!ctx || !sfx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  return {
    unlock() {
      const c = ensure();
      if (!c) return;
      if (c.state === "suspended") void c.resume();
      startDrone();
    },
    resume() {
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    setMuted(next) {
      muted = next;
      if (!ctx || !master) return;
      master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.02);
    },
    shot() {
      burst(1400 + Math.random() * 400, 0.7, 0.09, 0.55, 0.9 + Math.random() * 0.2);
      tone(170 + Math.random() * 30, 0.07, "triangle", 0.22, 0, -80);
      tone(680, 0.04, "square", 0.05);
    },
    dry() {
      tone(220, 0.04, "square", 0.06);
    },
    hit() {
      tone(1480 + Math.random() * 200, 0.05, "square", 0.07);
      burst(2400, 2, 0.04, 0.12, 1.2);
    },
    hurt() {
      burst(180, 0.6, 0.18, 0.4, 0.7);
      tone(90, 0.16, "sine", 0.2, 0, -40);
    },
    kill() {
      tone(420, 0.12, "triangle", 0.1, 0, -180);
      burst(600, 0.8, 0.12, 0.2);
    },
    reload() {
      tone(540, 0.04, "square", 0.05, 0);
      tone(320, 0.05, "triangle", 0.06, 0.12);
      tone(180, 0.08, "sine", 0.08, 0.42, -40);
    },
    wave() {
      tone(392, 0.14, "sine", 0.08, 0);
      tone(523, 0.18, "sine", 0.07, 0.12);
    },
    pickup() {
      tone(660, 0.08, "sine", 0.07, 0);
      tone(880, 0.1, "sine", 0.06, 0.07);
    },
    step() {
      burst(240 + Math.random() * 80, 0.8, 0.04, 0.08, 0.85 + Math.random() * 0.3);
    },
    close() {
      for (const o of drones) {
        try {
          o.stop();
          o.disconnect();
        } catch {
          /* already stopped */
        }
      }
      drones.length = 0;
      if (ctx) void ctx.close();
      ctx = null;
    },
  };
}
