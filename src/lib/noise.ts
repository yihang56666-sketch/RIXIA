/** 专注氛围音：Web Audio 实时合成（白噪 / 雨声 / 海浪），零音频资源、离线可用 */

export type NoiseKind = "white" | "rain" | "waves";

export const NOISE_OPTIONS: Array<{ key: NoiseKind; label: string }> = [
  { key: "white", label: "白噪音" },
  { key: "rain", label: "雨声" },
  { key: "waves", label: "海浪" },
];

interface Engine {
  kind: NoiseKind;
  stop: () => void;
  setVolume: (value: number) => void;
}

let engine: Engine | null = null;

function createNoiseBuffer(ctx: AudioContext, kind: NoiseKind): AudioBuffer {
  const seconds = 4;
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, sampleRate * seconds, sampleRate);
  const data = buffer.getChannelData(0);
  if (kind === "waves") {
    // 棕噪：积分白噪，能量集中在低频
    let last = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[index] = last * 3.2;
    }
  } else {
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }
  return buffer;
}

export function startAmbience(kind: NoiseKind, volume: number): void {
  stopAmbience();
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    void ctx.resume?.();

    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx, kind);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    if (kind === "rain") {
      filter.type = "lowpass";
      filter.frequency.value = 1400;
    } else if (kind === "waves") {
      filter.type = "lowpass";
      filter.frequency.value = 500;
    } else {
      filter.type = "highpass";
      filter.frequency.value = 80;
    }

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    // 海浪：用低频 LFO 缓慢起伏音量，模拟潮汐
    let lfo: OscillatorNode | null = null;
    if (kind === "waves") {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = Math.min(0.35, volume * 0.6);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
    }

    source.start();

    engine = {
      kind,
      setVolume: (value) => {
        gain.gain.setTargetAtTime(value, ctx.currentTime, 0.1);
      },
      stop: () => {
        // 每个节点独立 try，保证单个 stop 失败不阻断其余清理；
        // AudioContext 必须关闭（浏览器有数量上限）。
        try {
          source.stop();
        } catch {
          // 已停止则忽略
        }
        try {
          lfo?.stop();
        } catch {
          // ignore
        }
        window.setTimeout(() => {
          void ctx.close().catch(() => undefined);
        }, 200);
      },
    };
  } catch {
    engine = null;
  }
}

export function setAmbienceVolume(value: number): void {
  engine?.setVolume(value);
}

export function stopAmbience(): void {
  engine?.stop();
  engine = null;
}

export function currentAmbience(): NoiseKind | null {
  return engine?.kind ?? null;
}
