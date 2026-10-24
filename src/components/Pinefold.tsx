import { useEffect, useRef, useState, type ReactNode } from "react";
import { Axe, Backpack, Coins, HandCoins, Package, Pause, TreePine, Volume2, VolumeX } from "lucide-react";
import type { Phase, TouchInput } from "@/game/types";
import type { PineApi, Snap, UpgradeId } from "@/game/pinefold";

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
  const knobRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [snap, setSnap] = useState<Snap>(emptySnap);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 959px), (pointer: coarse)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          touchRef.current.attack = true;
        }}
        onPointerUp={() => {
          touchRef.current.attack = false;
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
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 px-3 pr-16 pt-[max(0.6rem,env(safe-area-inset-top))]">
          <div className="flex flex-wrap items-stretch gap-2">
            <Chip mark={<Coins className="size-5" />} label="Coins" hint="Spend these in Camp" value={String(snap.coins)} />
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
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="flex items-center gap-2 rounded-full border border-[#e39a3c]/40 bg-[#10261c]/85 px-3 py-2 text-sm text-[#f6f0e4] shadow-lg">
              <TreePine className="size-4 shrink-0 text-[#e39a3c]" />
              <span className="font-semibold text-[#ffe08a]">NEXT:</span> {snap.goal}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/15 bg-[#10261c]/75 px-3 py-2 text-xs font-semibold text-[#f6f0e4] shadow-lg">
              <span className="rounded-lg bg-[#e39a3c] px-2 py-1 text-[#1c1206]">1 Chop trees</span>
              <span className="text-[#e39a3c]">›</span>
              <span className={snap.pack > 0 ? "rounded-lg bg-[#f6f0e4] px-2 py-1 text-[#1c2a22]" : "rounded-lg bg-white/10 px-2 py-1 text-white/60"}>2 Carry logs</span>
              <span className="text-[#e39a3c]">›</span>
              <span className={snap.stock > 0 ? "rounded-lg bg-[#f6f0e4] px-2 py-1 text-[#1c2a22]" : "rounded-lg bg-white/10 px-2 py-1 text-white/60"}>3 Sell at yard</span>
              <span className="text-[#e39a3c]">›</span>
              <span className={snap.saw ? "rounded-lg bg-[#f6f0e4] px-2 py-1 text-[#1c2a22]" : "rounded-lg bg-white/10 px-2 py-1 text-white/60"}>4 Process planks</span>
            </div>
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
              className="min-h-14 rounded-full border border-[#e39a3c]/70 bg-[#10261c]/85 px-5 text-sm font-semibold tracking-wide text-[#f6e7c1] shadow-lg"
              onClick={() => setSheet((v) => !v)}
            >
              Camp
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
        <button
          type="button"
          data-control
          className="absolute top-[max(0.6rem,env(safe-area-inset-top))] right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#10261c]/80 text-[#f6f0e4]"
          aria-label="Pause"
          onClick={() => apiRef.current?.pause()}
        >
          <Pause className="size-4" />
        </button>
      ) : null}

      {sheet && playing ? (
        <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-3xl border-t border-[#e39a3c]/40 bg-[#10261c]/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[#f6f0e4] shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-3xl text-[#ffe08a] italic">Camp</h2>
            <button type="button" className="min-h-11 px-3 text-sm text-[#f6f0e4]/70" onClick={() => setSheet(false)}>
              Close
            </button>
          </div>
          <ul className="grid max-h-[46dvh] gap-2 overflow-y-auto">
            {rows.map((row) => {
              const lock = snap.lock[row.id];
              const done = row.cost == null;
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div>
                    <p className="font-semibold">{row.title}</p>
                    <p className="text-sm text-[#f6f0e4]/65">{lock ?? row.detail}</p>
                  </div>
                  <button
                    type="button"
                    disabled={done}
                    className="min-h-11 min-w-20 rounded-full bg-[#e39a3c] px-3 text-sm font-semibold text-[#1c1206] disabled:bg-white/10 disabled:text-[#f6f0e4]/40"
                    onClick={() => apiRef.current?.buy(row.id)}
                  >
                    {done ? (
                      "Owned"
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1">
                        <Coins className="size-4" />
                        {row.cost}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
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
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#10261c]/80 py-1 pr-3 pl-1 text-[#f6f0e4] shadow-lg" title={hint}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e39a3c] text-[#1c1206]" aria-hidden>
        {mark}
      </span>
      <div>
        <p className="text-[10px] font-semibold tracking-widest text-[#f6f0e4]/65 uppercase">{label}</p>
        <p className="font-display text-2xl leading-none text-[#ffe08a]">{value}</p>
      </div>
    </div>
  );
}
