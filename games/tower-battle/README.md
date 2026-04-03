# Tower Battle — 共用模块

存放 tower-defence 与 tower-attack 的共同部分：

- `map.js` — 地图布局与路径
- `units.js` — 兵种定义（攻守双方共用）
- `protocol.js` — P2P 通信协议（基于 PeerJS）
- `theme.css` — 共用样式主题

## 说明

两个子项目通过相对路径引用此目录中的模块，保持逻辑一致。
