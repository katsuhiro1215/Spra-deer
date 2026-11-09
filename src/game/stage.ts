export const VIEW = { width: 720, height: 1280 };
export const FIELD = { left: 114, right: 606, top: 240, bottom: 3700 };
export const GOAL = { x: 360, y: 300, radius: 65 };
export const RULES = { speed: 235, radius: 14, poopRadius: 21, jumpDuration: .82, jumpHeight: 80, jumpCooldown: .24, step: 1 / 120 };
export type Point = { x: number; y: number };
export type TrapDefinition = Point & { id: string; width: number; height: number; warning: number };
