export function shouldRestartLoop(input: {
  loopEnabled: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
}): boolean {
  return input.loopEnabled && !input.playing && input.duration > 0 && input.currentTime >= input.duration - 0.5;
}

export function shouldPauseForSleepTimer(input: {
  remainingMinutes: number | null;
  remainingPlays: number | null;
  currentTime: number;
  duration: number;
}): boolean {
  const reachedEnd = input.duration > 0 && input.currentTime >= input.duration - 0.5;
  const minuteExpired = input.remainingMinutes !== null && input.remainingMinutes <= 0;
  const playCountExpired = reachedEnd && input.remainingPlays !== null && input.remainingPlays <= 0;
  return minuteExpired || playCountExpired;
}
