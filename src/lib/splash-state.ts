// Ephemeral module-level coordination between the launch splash and
// route-level redirects. Not persisted; only exists during the initial mount.

let active = false;
const listeners = new Set<() => void>();

export function beginSplash() {
  active = true;
}
export function endSplash() {
  active = false;
  for (const fn of listeners) fn();
}
export function isSplashActive() {
  return active;
}
export function onSplashEnd(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
