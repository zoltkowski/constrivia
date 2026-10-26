import type { PersistedAnimation } from './persistedTypes';

/** Animation metadata is optional in legacy files; ignore malformed motions. */
export function readAnimationSettings(raw: unknown, pointIds: ReadonlySet<string>): PersistedAnimation | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as PersistedAnimation).motions)) return null;
  const settings = raw as PersistedAnimation;
  const motions = new Map<string, PersistedAnimation['motions'][number]>();
  for (const motion of settings.motions) {
    if (!motion || typeof motion.pointId !== 'string' || !pointIds.has(motion.pointId) ||
      typeof motion.speed !== 'number' || !Number.isFinite(motion.speed) || motion.speed < 0 ||
      (motion.direction !== 1 && motion.direction !== -1)) continue;
    motions.set(motion.pointId, { pointId: motion.pointId, speed: motion.speed, direction: motion.direction });
  }
  return { ...(settings.enabled === false ? { enabled: false } : {}), loop: settings.loop === true, motions: [...motions.values()] };
}
