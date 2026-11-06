// Current wall-clock time in Unix milliseconds. Services that compute expiry or deadlines take it as a
// dependency, so tests can fix the time.
export type WallClock = () => number;

export const systemWallClock: WallClock = () => Date.now();
