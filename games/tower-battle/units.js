/**
 * tower-battle/units.js
 * 兵种定义，攻守双方共用
 */

export const UNIT_DEFS = {
  goblin:  { name: '哥布林', icon: '👺', hp: 80,   speed: 90,  reward: 10, cost: 15, size: 0.7 },
  orc:     { name: '兽人',   icon: '👹', hp: 200,  speed: 55,  reward: 20, cost: 30, size: 0.9 },
  troll:   { name: '巨魔',   icon: '🧌', hp: 500,  speed: 35,  reward: 40, cost: 60, size: 1.1 },
  dragon:  { name: '飞龙',   icon: '🐉', hp: 300,  speed: 110, reward: 50, cost: 80, size: 1.0 },
  phantom: { name: '幽灵',   icon: '👻', hp: 150,  speed: 80,  reward: 30, cost: 50, size: 0.8 },
  golem:   { name: '石像鬼', icon: '🗿', hp: 1200, speed: 25,  reward: 80, cost: 120, size: 1.3 },
};
