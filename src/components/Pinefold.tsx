import { useEffect, useRef, useState, type ReactNode } from "react";
import { Axe, Backpack, CheckCircle2, Coins, Gauge, HandCoins, Hammer, HardHat, LockKeyhole, Monitor, Package, Pause, Settings, Sparkles, TreePine, Trees, Volume2, VolumeX, Waves, Warehouse, X } from "lucide-react";
import type { Phase, TouchInput } from "@/game/types";
import type { PineApi, Snap, UpgradeId } from "@/game/pinefold";

type GraphicsQuality = "performance" | "balanced" | "high";
type LocalOptions = { quality: GraphicsQuality; cameraDistance: number; reducedMotion: boolean; showTips: boolean };
function loadOptions(): LocalOptions {
  const fallback: LocalOptions = { quality: window.matchMedia("(pointer: coarse), (max-width: 959px)").matches ? "performance" : "high", cameraDistance: 8.4, reducedMotion: false, showTips: true };
  try {
    const raw = localStorage.getItem("pinefold-options");
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<LocalOptions>;
    return {
      quality: saved.quality === "performance" || saved.quality === "balanced" ? saved.quality : "high",
      cameraDistance: typeof saved.cameraDistance === "number" ? Math.max(6, Math.min(12, saved.cameraDistance)) : fallback.cameraDistance,
      reducedMotion: Boolean(saved.reducedMotion), showTips: saved.showTips !== false,
    };
  } catch { return fallback; }
}
const emptySnap = (): Snap => ({
  coins: 0,
  pack: 0,
  packCap: 6,
  stock: 0,
  stockCap: 24,
  price: 4,
  rate: 0,
  axe: 1,
  axeCost: 12,
  packLv: 0,
  packCost: 16,
  hands: 0,
  handCost: 28,
  saw: false,
  sawCost: 80,
  north: false,
  northCost: 200,
  cabin: 0,
  cabinCost: 100,
  wheel: false,
  wheelCost: 900,
  goal: "Chop a tree, pick up the log, dump it in the yard.",
  banner: "",
  pop: null,
  lock: {},
});

export function Pinefold() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<PineApi | null>(null);
  const touchRef = useRef<TouchInput>({
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    attack: false,
    reload: false,
    use: false,
    melee: false,
  });
  const stickId = useRef<number | null>(null);
  const lookPointerId = useRef<number | null>(null);
  const lastLookPoint = useRef<{ x: number; y: number } | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [options, setOptions] = useState<LocalOptions>(loadOptions);
  const [snap, setSnap] = useState<Snap>(emptySnap);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 959px), (pointer: coarse)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("pinefold-options", JSON.stringify(options)); } catch { /* settings remain usable without storage */ }
    if (!ready || !apiRef.current) return;
    apiRef.current.setGraphicsQuality(options.quality);
    apiRef.current.setCameraDistance(options.cameraDistance);
    apiRef.current.setReducedMotion(options.reducedMotion);
  }, [options, ready]);

  function updateOptions(patch: Partial<LocalOptions>) {
    setOptions((current) => ({ ...current, ...patch }));
  }

  useEffect(() => {
    let dead = false;
    let api: PineApi | null = null;
    void import("@/game/pinefold").then(({ mountPine }) => {
      if (dead || !canvasRef.current) return;
      api = mountPine(canvasRef.current, touchRef.current, {
        onPhase: (next) => {
          if (!dead) setPhase(next);
        },
        onReady: (meta) => {
          if (dead) return;
          setReady(true);
          setMuted(meta.muted);
        },
        onError: (message) => {
          if (!dead) setError(message);
        },
      });
      apiRef.current = api;
    }).catch((reason: unknown) => {
      if (dead) return;
      const message = reason instanceof Error ? reason.message : "The forest engine could not be loaded.";
      console.error("Pinefold game startup failed:", reason);
      setError(message);
      setReady(false);
    });
    return () => {
      dead = true;
      api?.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const api = apiRef.current;
      if (!api) return;
      const next = api.snap();
      const key = `${next.coins}|${next.pack}|${next.stock}|${next.axe}|${next.hands}|${next.saw}|${next.north}|${next.cabin}|${next.wheel}|${next.goal}|${next.banner}|${next.pop?.n ?? 0}|${next.rate.toFixed(1)}`;
      if (key !== last) {
        last = key;
        setSnap(next);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (phase === "playing") return;
    touchRef.current.moveX = 0;
    touchRef.current.moveY = 0;
    touchRef.current.attack = false;
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
  }, [phase]);

  function moveStick(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = rect.width * 0.36;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(mag, max);
    dx = (dx / mag) * clamped;
    dy = (dy / mag) * clamped;
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    touchRef.current.moveX = dx / max;
    touchRef.current.moveY = -dy / max;
  }

  useEffect(() => {
    if (!upgradeOpen && !sheet && !settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUpgradeOpen(false);
        setSheet(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [upgradeOpen, sheet, settingsOpen]);

  const playing = phase === "playing";

  const rows: Array<{ id: UpgradeId; title: string; detail: string; cost: number | null }> = [
    { id: "axe", title: `Axe  ${snap.axe}/5`, detail: "Fewer chops, more wood.", cost: snap.axeCost },
    { id: "pack", title: `Pack  ${snap.packCap}`, detail: "Carry more before a dump.", cost: snap.packCost },
    { id: "hand", title: `Hands  ${snap.hands}/4`, detail: "They cut and haul, even if you leave.", cost: snap.handCost },
    { id: "saw", title: "Sawbench", detail: snap.saw ? "Planks are selling." : "Turns the pile into better pay.", cost: snap.sawCost },
    { id: "north", title: "North stand", detail: snap.north ? "Hardwood is open." : "Big trees past the gate.", cost: snap.northCost },
    {
      id: "cabin",
      title: `Cabin  ${snap.cabin}/3`,
      detail: "Walls, then a roof. Pay goes up.",
      cost: snap.cabinCost,
    },
    { id: "wheel", title: "Creek wheel", detail: snap.wheel ? "The yard sells faster." : "A second buyer on the creek.", cost: snap.wheelCost },
  ];

  return (
    <main className="game-root relative h-dvh w-full overflow-hidden bg-[#8ec8ea] text-fg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") {
            // Touch-drag anywhere on the open play area rotates the view.
            lookPointerId.current = e.pointerId;
            lastLookPoint.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
          if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
            lookPointerId.current = e.pointerId;
            lastLookPoint.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
            e.preventDefault();
            return;
          }
          if (e.button === 0) touchRef.current.attack = true;
        }}
        onPointerMove={(e) => {
          if (lookPointerId.current !== e.pointerId || !lastLookPoint.current) return;
          const dx = e.clientX - lastLookPoint.current.x;
          const dy = e.clientY - lastLookPoint.current.y;
          touchRef.current.lookX += dx;
          touchRef.current.lookY += dy;
          lastLookPoint.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          touchRef.current.attack = false;
          if (lookPointerId.current === e.pointerId) {
            lookPointerId.current = null;
            lastLookPoint.current = null;
          }
        }}
        onPointerCancel={(e) => {
          touchRef.current.attack = false;
          if (lookPointerId.current === e.pointerId) {
            lookPointerId.current = null;
            lastLookPoint.current = null;
          }
        }}
        onPointerLeave={() => {
          touchRef.current.attack = false;
        }}
      />

      <div className="game-edge pointer-events-none absolute inset-0" />

      {playing && snap.pop ? (
        <p
          key={snap.pop.n}
          className="pop-up pointer-events-none absolute top-[30%] left-1/2 flex items-center gap-2 font-display text-5xl text-[#ffe08a] drop-shadow-[0_3px_0_#1c1206]"
        >
          {snap.pop.text.includes("log") ? <Backpack className="size-9" /> : <Coins className="size-9" />}
          {snap.pop.text}
        </p>
      ) : null}

      {playing ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 px-3 pr-28 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 sm:pr-56 sm:pt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Chip mark={<Coins className="size-5" />} label="Coins" hint="Spend these on camp upgrades" value={String(snap.coins)} />
            <Chip
              mark={<Backpack className="size-5" />}
              label="Carrying"
              hint="Logs on you. Dump them in the yard."
              value={`${snap.pack}/${snap.packCap}`}
            />
            <Chip
              mark={<Package className="size-5" />}
              label="In yard"
              hint="Logs waiting to sell"
              value={`${snap.stock}/${snap.stockCap}`}
            />
            <Chip
              mark={<HandCoins className="size-5" />}
              label={snap.rate > 0 ? "Selling" : "Each log"}
              hint={snap.rate > 0 ? "Coins coming in each second" : "Coins you get for one log"}
              value={snap.rate > 0 ? `${snap.rate.toFixed(1)}/s` : String(snap.price)}
            />
          </div>
          <div className="mt-1 flex max-w-2xl flex-col gap-3">
            {options.showTips ? <p className="hud-objective flex items-center gap-2 rounded-2xl border border-[#e39a3c]/45 bg-[#10261c]/90 px-4 py-3 text-sm text-[#f6f0e4] shadow-xl">
              <TreePine className="size-4 shrink-0 text-[#e39a3c]" />
              <span className="font-semibold text-[#ffe08a]">NEXT:</span> {snap.goal}
            </p> : null}
            {options.showTips ? <div className="tips-stack flex flex-col gap-2"><div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/15 bg-[#10261c]/78 px-3 py-2 text-xs font-semibold text-[#f6f0e4] shadow-lg">
              <span className="rounded-lg bg-[#e39a3c] px-2 py-1 text-[#1c1206]">1 Chop trees</span>
              <span className="text-[#e39a3c]">›</span>
              <span className={snap.pack > 0 ? "rounded-lg bg-[#f6f0e4] px-2 py-1 text-[#1c2a22]" : "rounded-lg bg-white/10 px-2 py-1 text-white/60"}>2 Carry logs</span>
              <span className="text-[#e39a3c]">›</span>
              <span className={snap.stock > 0 ? "rounded-lg bg-[#f6f0e4] px-2 py-1 text-[#1c2a22]" : "rounded-lg bg-white/10 px-2 py-1 text-white/60"}>3 Sell at yard</span>
              <span className="text-[#e39a3c]">›</span>
              <span className={snap.saw ? "rounded-lg bg-[#f6f0e4] px-2 py-1 text-[#1c2a22]" : "rounded-lg bg-white/10 px-2 py-1 text-white/60"}>4 Process planks</span>
            </div>
            <div className="w-full max-w-md rounded-2xl border border-[#e39a3c]/35 bg-[#10261c]/88 px-4 py-3 text-[#f6f0e4] shadow-xl">
              <div className="mb-1 flex items-center justify-between gap-4 text-xs">
                <span className="font-bold tracking-wider text-[#ffe08a] uppercase">Mill Operations</span>
                <span className="text-white/65">{snap.hands} / 4 crew</span>
              </div>
              <div className="mb-2 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#e39a3c] transition-all" style={{ width: `${Math.min(100, (snap.stock / Math.max(1, snap.stockCap)) * 100)}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/75">
                <span>{snap.saw ? "Sawbench online" : "Sawbench locked"}</span>
                <span>{snap.north ? "Hardwood unlocked" : "North forest locked"}</span>
                <span>{snap.wheel ? "Creek buyer online" : "One yard buyer"}</span>
              </div>
            </div></div> : null}
          </div>
          {snap.banner ? (
            <p className="font-display text-3xl text-[#ffe08a] italic drop-shadow-[0_2px_0_#1c1206]">{snap.banner}</p>
          ) : null}
        </div>
      ) : null}

      {playing ? (
        <div className="safe-b pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-3">
          {narrow ? (
            <div
              data-control
              className="pointer-events-auto relative h-32 w-32 rounded-full border border-white/40 bg-[#143022]/35"
              aria-label="Move"
              onPointerDown={(e) => {
                e.stopPropagation();
                stickId.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                moveStick(e);
              }}
              onPointerMove={(e) => {
                if (e.pointerId !== stickId.current) return;
                moveStick(e);
              }}
              onPointerUp={(e) => {
                if (e.pointerId !== stickId.current) return;
                stickId.current = null;
                touchRef.current.moveX = 0;
                touchRef.current.moveY = 0;
                if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
              }}
              onPointerCancel={() => {
                stickId.current = null;
                touchRef.current.moveX = 0;
                touchRef.current.moveY = 0;
                if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
              }}
            >
              <div ref={knobRef} className="absolute top-1/2 left-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
            </div>
          ) : (
            <p className="pb-3 text-xs font-semibold tracking-widest text-[#f6f0e4] uppercase drop-shadow">WASD walk · Space chops</p>
          )}
          <div className="pointer-events-auto flex items-end gap-3 pb-1">
            <button
              type="button"
              data-control
              className="flex min-h-14 items-center gap-2 rounded-full border border-[#e39a3c]/70 bg-[#10261c]/90 px-5 text-sm font-semibold tracking-wide text-[#f6e7c1] shadow-xl backdrop-blur-md"
              onClick={() => { setSheet(false); setUpgradeOpen(true); }}
            >
              <Sparkles className="size-4 text-[#ffe08a]" /> Upgrades
            </button>
            <button
              type="button"
              data-control
              className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 border-[#fff1d2] bg-[#e39a3c] text-[#1c1206] shadow-[0_6px_0_#8a5412] active:translate-y-1 active:shadow-none"
              aria-label="Chop"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                touchRef.current.attack = true;
              }}
              onPointerUp={() => {
                touchRef.current.attack = false;
              }}
              onPointerCancel={() => {
                touchRef.current.attack = false;
              }}
            >
              <Axe className="size-8" />
              <span className="text-[10px] font-bold tracking-widest">CHOP</span>
            </button>
          </div>
        </div>
      ) : null}

      {playing ? (
        <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 flex items-center gap-2">
          <button type="button" data-control className="hud-action hidden sm:flex" onClick={() => { setSheet(false); setUpgradeOpen(true); }}><Sparkles className="size-4 text-[#ffe08a]" /> <span>Upgrades</span></button>
          <button type="button" data-control className="hud-icon-button" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}><Settings className="size-5" /></button>
          <button type="button" data-control className="hud-icon-button" aria-label="Pause" title="Pause" onClick={() => apiRef.current?.pause()}><Pause className="size-5" /></button>
        </div>
      ) : null}

      {(sheet || upgradeOpen) && playing && !settingsOpen ? (
        <div className="modal-scrim absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-6" onPointerDown={(e) => { if (e.target === e.currentTarget) { setSheet(false); setUpgradeOpen(false); } }}>
          <section className="upgrade-panel w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-[#e39a3c]/40 bg-[#10261c]/96 text-[#f6f0e4] shadow-2xl backdrop-blur-xl">
            <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7 sm:py-5">
              <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e39a3c] text-[#1c1206]"><Sparkles className="size-6" /></span><div><p className="text-[10px] font-bold tracking-[0.22em] text-[#e8ad60] uppercase">Camp development</p><h2 className="font-display text-3xl leading-none text-[#ffe08a] sm:text-4xl">Upgrade yard</h2><p className="mt-1 text-sm text-white/60">Invest in your crew, equipment, and timber business.</p></div></div>
              <div className="flex items-center gap-3"><div className="hidden rounded-xl border border-[#e39a3c]/35 bg-[#e39a3c]/10 px-4 py-2 sm:block"><p className="text-[10px] font-bold tracking-widest text-white/55 uppercase">Available funds</p><p className="flex items-center gap-2 font-display text-2xl text-[#ffe08a]"><Coins className="size-5" />{snap.coins}</p></div><button type="button" className="hud-icon-button" aria-label="Close upgrades" onClick={() => { setSheet(false); setUpgradeOpen(false); }}><X className="size-5" /></button></div>
            </header>
            <div className="max-h-[min(68dvh,650px)] overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
              <div className="mb-4 grid grid-cols-2 gap-2 sm:hidden"><div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] uppercase tracking-widest text-white/55">Coins</p><p className="font-display text-2xl text-[#ffe08a]">{snap.coins}</p></div><div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] uppercase tracking-widest text-white/55">Crew</p><p className="font-display text-2xl text-[#ffe08a]">{snap.hands}/4</p></div></div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((row) => {
                  const lock = snap.lock[row.id]; const done = row.cost == null;
                  const mark = row.id === "axe" ? <Axe className="size-6" /> : row.id === "pack" ? <Backpack className="size-6" /> : row.id === "hand" ? <HardHat className="size-6" /> : row.id === "saw" ? <Hammer className="size-6" /> : row.id === "north" ? <Trees className="size-6" /> : row.id === "cabin" ? <Warehouse className="size-6" /> : <Waves className="size-6" />;
                  const status = done ? "Installed" : lock ? "Locked" : snap.coins >= (row.cost ?? 0) ? "Ready to buy" : "Keep earning";
                  return <article key={row.id} className={`upgrade-card flex min-h-44 flex-col rounded-2xl border p-4 transition duration-200 ${done ? "border-[#81b88a]/35 bg-[#2f6b45]/15" : "border-white/10 bg-white/[0.045] hover:border-[#e39a3c]/45 hover:bg-white/[0.075]"}`}>
                    <div className="flex items-start justify-between gap-3"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${done ? "bg-[#2f6b45] text-white" : "bg-[#e39a3c]/15 text-[#ffe08a]"}`}>{done ? <CheckCircle2 className="size-6" /> : mark}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-white/55 uppercase">{status}</span></div>
                    <h3 className="mt-3 font-display text-2xl leading-none text-[#f6f0e4]">{row.title}</h3><p className="mt-2 min-h-10 text-sm leading-relaxed text-white/60">{lock ?? row.detail}</p>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-4">{done ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#9ecfa4]"><CheckCircle2 className="size-4" /> Owned</span> : <span className="inline-flex items-center gap-1.5 font-semibold text-[#ffe08a]"><Coins className="size-4" />{row.cost}</span>}<button type="button" disabled={done} className="upgrade-buy-button" onClick={() => apiRef.current?.buy(row.id)}>{done ? "Installed" : lock ? <><LockKeyhole className="size-4" /> Locked</> : <><Sparkles className="size-4" /> Upgrade</>}</button></div>
                  </article>;
                })}
              </div>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 sm:px-7"><p className="flex items-center gap-2 text-xs text-white/55"><Gauge className="size-4 text-[#e8ad60]" /> Production scales with your camp investments.</p><button type="button" className="min-h-11 rounded-full border border-white/15 px-5 text-sm font-semibold text-white/80 hover:bg-white/10" onClick={() => { setSheet(false); setUpgradeOpen(false); }}>Back to forest</button></footer>
          </section>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="modal-scrim absolute inset-0 z-40 flex items-center justify-center p-3 sm:p-6" onPointerDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-panel w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#10261c]/97 text-[#f6f0e4] shadow-2xl backdrop-blur-xl">
            <header className="flex items-center justify-between border-b border-white/10 px-5 py-5 sm:px-7"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e39a3c] text-[#1c1206]"><Settings className="size-6" /></span><div><p className="text-[10px] font-bold tracking-[0.22em] text-[#e8ad60] uppercase">Customize your session</p><h2 className="font-display text-3xl text-[#ffe08a]">Settings</h2></div></div><button type="button" className="hud-icon-button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X className="size-5" /></button></header>
            <div className="grid gap-5 px-5 py-5 sm:px-7">
              <div className="settings-row"><div className="flex items-center gap-3"><span className="settings-icon"><Monitor className="size-5" /></span><div><p className="font-semibold">Graphics quality</p><p className="text-sm text-white/55">Balance detail and frame rate.</p></div></div><div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1">{(["performance", "balanced", "high"] as GraphicsQuality[]).map((value) => <button key={value} type="button" className={`quality-option ${options.quality === value ? "is-selected" : ""}`} onClick={() => updateOptions({ quality: value })}>{value === "performance" ? "Fast" : value === "balanced" ? "Balanced" : "High"}</button>)}</div></div>
              <div className="settings-row"><div className="flex items-center gap-3"><span className="settings-icon"><Gauge className="size-5" /></span><div><p className="font-semibold">Camera distance</p><p className="text-sm text-white/55">Widen or tighten your view.</p></div></div><div className="flex items-center gap-3"><input aria-label="Camera distance" className="settings-range" type="range" min="6" max="12" step="0.5" value={options.cameraDistance} onChange={(e) => updateOptions({ cameraDistance: Number(e.target.value) })} /><span className="w-10 text-right text-sm tabular-nums text-[#ffe08a]">{options.cameraDistance.toFixed(1)}</span></div></div>
              <div className="settings-row"><div className="flex items-center gap-3"><span className="settings-icon"><Waves className="size-5" /></span><div><p className="font-semibold">Reduced motion</p><p className="text-sm text-white/55">Tone down ambient movement.</p></div></div><button type="button" role="switch" aria-checked={options.reducedMotion} className={`settings-switch ${options.reducedMotion ? "is-on" : ""}`} onClick={() => updateOptions({ reducedMotion: !options.reducedMotion })}><span /></button></div>
              <div className="settings-row"><div className="flex items-center gap-3"><span className="settings-icon"><TreePine className="size-5" /></span><div><p className="font-semibold">Gameplay hints</p><p className="text-sm text-white/55">Show goals and production steps.</p></div></div><button type="button" role="switch" aria-checked={options.showTips} className={`settings-switch ${options.showTips ? "is-on" : ""}`} onClick={() => updateOptions({ showTips: !options.showTips })}><span /></button></div>
              <div className="settings-row"><div className="flex items-center gap-3"><span className="settings-icon">{muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}</span><div><p className="font-semibold">Game audio</p><p className="text-sm text-white/55">Sound effects and woodland ambience.</p></div></div><button type="button" className="quality-option is-selected min-w-24" onClick={() => { const next = !muted; setMuted(next); apiRef.current?.setMuted(next); }}>{muted ? "Sound off" : "Sound on"}</button></div>
            </div>
            <footer className="flex items-center justify-between border-t border-white/10 px-5 py-4 sm:px-7"><p className="text-xs text-white/40">Settings save automatically on this device.</p><button type="button" className="min-h-11 rounded-full bg-[#e39a3c] px-5 text-sm font-semibold text-[#1c1206]" onClick={() => setSettingsOpen(false)}>Done</button></footer>
          </section>
        </div>
      ) : null}

      {phase === "menu" ? (
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-[#143022]/88 via-[#143022]/25 to-transparent p-5 md:items-center md:px-16">
          <div className="max-w-md rounded-3xl border border-[#e39a3c]/50 bg-[#10261c]/92 p-6 text-[#f6f0e4] shadow-2xl">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-[#e39a3c] uppercase">
              <TreePine className="size-4" />
              Forest camp
            </p>
            <h1 className="font-display text-6xl leading-none text-[#ffe08a] italic">Pinefold</h1>
            <p className="mt-3 text-base leading-relaxed text-[#f6f0e4]/75">
              Start by chopping trees and carrying logs to the yard. Earn coins, hire workers, build a sawmill, fulfill bigger goals, and grow a tiny forest camp into a timber business.
            </p>
            {error ? <p className="mt-3 text-sm text-[#ffb4a2]">{error}</p> : null}
            <div className="mt-5 flex items-center gap-3">
              <button
                id="start-shift"
                type="button"
                disabled={!ready || Boolean(error)}
                className="min-h-12 rounded-full bg-primary px-7 text-base font-semibold text-primary-fg disabled:opacity-50"
                onClick={(e) => {
                  e.currentTarget.blur();
                  apiRef.current?.start();
                }}
              >
                {ready ? "Open the camp" : "Growing the trees"}
              </button>
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-[#e39a3c]/50 text-[#f6f0e4]"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  apiRef.current?.setMuted(next);
                }}
              >
                {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
            </div>
            <button type="button" className="mt-3 flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-white/75 hover:bg-white/10" onClick={() => setSettingsOpen(true)}><Settings className="size-4" /> Graphics & settings</button>
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-[#f6f0e4]/70">
              <li>WASD or the stick</li>
              <li>Space or Chop</li>
              <li>Walk into the yard</li>
              <li>Camp spends coins</li>
            </ul>
          </div>
        </div>
      ) : null}

      {phase === "paused" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#143022]/55 px-5">
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6">
            <p className="text-xs font-semibold tracking-widest text-accent uppercase">Hold</p>
            <h2 className="font-display text-4xl italic">Camp paused</h2>
            <p className="mt-2 text-sm text-muted">{snap.goal}</p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                className="min-h-12 rounded-full bg-primary font-semibold text-primary-fg"
                onClick={(e) => {
                  e.currentTarget.blur();
                  apiRef.current?.resume();
                }}
              >
                Resume
              </button>
              <button type="button" className="min-h-12 rounded-full border border-border font-semibold" onClick={() => setSettingsOpen(true)}><Settings className="mr-2 inline size-4" /> Settings</button>
              <button
                type="button"
                className="min-h-12 rounded-full border border-border font-semibold"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  apiRef.current?.setMuted(next);
                }}
              >
                {muted ? "Sound off" : "Sound on"}
              </button>
              <button type="button" className="min-h-11 text-sm text-muted" onClick={() => apiRef.current?.title()}>
                Back to the gate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Chip({
  mark,
  label,
  hint,
  value,
}: {
  mark: ReactNode;
  label: string;
  hint: string;
  value: string;
}) {
  return (
    <div className="hud-chip flex min-w-0 items-center gap-2 rounded-2xl border border-white/15 bg-[#10261c]/88 py-2 pr-4 pl-2 text-[#f6f0e4] shadow-xl backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-[#e39a3c]/45" title={hint}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ffc66c] to-[#d17b23] text-[#1c1206] shadow-inner" aria-hidden>
        {mark}
      </span>
      <div>
        <p className="text-[10px] font-semibold tracking-widest text-[#f6f0e4]/65 uppercase">{label}</p>
        <p className="font-display text-2xl leading-none text-[#ffe08a]">{value}</p>
      </div>
    </div>
  );
}
