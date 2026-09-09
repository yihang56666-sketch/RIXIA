/** 完成提示音：Web Audio 合成，无音频资源依赖，失败时静默 */
export function playChime(): void {
  let ownedContext: AudioContext | undefined;
  let closed = false;
  const closeContext = () => {
    const context = ownedContext;
    if (!context || closed) return;
    closed = true;
    void Promise.resolve().then(() => context.close()).catch((error) => console.warn("提示音资源清理失败", error));
  };
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    ownedContext = ctx;
    void ctx.resume?.().catch((error) => {
      console.warn("提示音未能启动", error);
      closeContext();
    });
    const base = ctx.currentTime;
    [523.25, 783.99].forEach((frequency, index) => {
      const start = base + index * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
    window.setTimeout(closeContext, 1200);
  } catch (error) {
    console.warn("提示音初始化失败", error);
    closeContext();
  }
}
