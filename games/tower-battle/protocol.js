/**
 * tower-battle/protocol.js
 * P2P 通信协议封装（基于 PeerJS）
 *
 * 消息类型：
 *   { type: 'room-ready',  role: 'defence' | 'attack' }
 *   { type: 'tower-place', col, row, towerKey }
 *   { type: 'tower-sell',  col, row }
 *   { type: 'wave-start',  waveNum, units: [{type, delay}] }
 *   { type: 'game-over',   winner: 'defence' | 'attack', score }
 */

export const MSG = {
  ROOM_READY:  'room-ready',
  TOWER_PLACE: 'tower-place',
  TOWER_SELL:  'tower-sell',
  WAVE_START:  'wave-start',
  GAME_OVER:   'game-over',
};

// TODO: PeerJS connection wrapper
