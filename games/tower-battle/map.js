/**
 * tower-battle/map.js
 * 共用地图布局与路径算法（与 tower-defence 保持同步）
 */

export const COLS = 12, ROWS = 12;
export const T_GRASS = 0, T_PATH = 1, T_START = 2, T_END = 3;

// Shared map layout — same grid used by both defence and attack
export const MAP_LAYOUT = [
  [2,1,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,1,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,1,0,0,0],
  [0,0,0,0,0,0,0,0,1,0,0,0],
  [0,0,1,1,1,0,0,0,1,0,0,0],
  [0,0,1,0,1,1,1,1,1,0,0,0],
  [0,0,1,0,0,0,0,0,0,0,0,0],
  [0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,1,3],
];

/** Build ordered waypoint list [{c,r}, ...] from START to END */
export function buildPath() {
  let start = null;
  outer: for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (MAP_LAYOUT[r][c] === T_START) { start = {c, r}; break outer; }
  const visited = new Set(), path = [];
  let cur = start;
  visited.add(`${cur.c},${cur.r}`);
  path.push({ c: cur.c, r: cur.r });
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (true) {
    let moved = false;
    for (const [dc, dr] of dirs) {
      const nc = cur.c + dc, nr = cur.r + dr, key = `${nc},${nr}`;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || visited.has(key)) continue;
      const t = MAP_LAYOUT[nr][nc];
      if (t === T_PATH || t === T_END) {
        visited.add(key); path.push({c: nc, r: nr});
        cur = {c: nc, r: nr}; moved = true;
        if (t === T_END) return path;
        break;
      }
    }
    if (!moved) break;
  }
  return path;
}
