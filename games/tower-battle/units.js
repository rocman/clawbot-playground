/**
 * tower-battle/units.js
 * 兵种定义 — 攻守双方共用，与 tower-defence ENEMY_DEFS 保持同步
 *
 * hp/speed/reward: base values (wave scaling applied in-game)
 * cost: attack-side purchase cost
 * color: canvas fill color (defence rendering)
 */

export const UNIT_DEFS = {
  grunt:   { name: '步兵',   icon: '🪖', color: '#ff7675', hp: 60,   speed: 55,  reward: 8,  cost: 10,  size: 10, desc: '数量多，均衡型' },
  runner:  { name: '快跑者', icon: '💨', color: '#fdcb6e', hp: 40,   speed: 105, reward: 10, cost: 15,  size: 8,  desc: '超高速，难以追踪' },
  tank:    { name: '重甲',   icon: '🛡️', color: '#636e72', hp: 250,  speed: 38,  reward: 20, cost: 35,  size: 14, desc: '血厚，消耗守方弹药' },
  boss:    { name: 'BOSS',   icon: '💀', color: '#6c5ce7', hp: 800,  speed: 28,  reward: 80, cost: 120, size: 18, desc: '超强单体，威慑力极高' },
  phantom: { name: '幽灵',   icon: '👻', color: '#a29bfe', hp: 150,  speed: 80,  reward: 30, cost: 50,  size: 10, desc: '半透明，难被锁定' },
  swarm:   { name: '虫群',   icon: '🐛', color: '#55efc4', hp: 20,   speed: 70,  reward: 3,  cost: 5,   size: 6,  desc: '极低费用，数量压制' },
};

/** Wave composition: returns array of unit type strings for wave waveNum */
export function getWaveUnits(waveNum) {
  const l = [];
  for (let i = 0; i < 4 + waveNum * 2; i++) l.push('grunt');
  if (waveNum >= 2) for (let i = 0; i < 2 + waveNum; i++) l.push('runner');
  if (waveNum >= 3) for (let i = 0; i < 1 + Math.floor(waveNum / 2); i++) l.push('tank');
  if (waveNum % 5 === 0) l.push('boss');
  // shuffle
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}
