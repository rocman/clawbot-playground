# Cookie Bridge — 安装与使用说明

一个开发工具，用于安全地将指定网站的 Cookie 发送给本地命令行程序。  
**全程需要用户手动授权，不会自动偷取任何数据。**

---

## 文件结构

```
cookie-grabber/
├── extension/          ← Chrome 插件目录（在 Chrome 中加载这个文件夹）
│   ├── manifest.json
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   ├── content.js
│   └── icons/
└── server/             ← 服务端 + CLI 工具
    ├── server.js       ← WS 服务器（可单独启动）
    ├── get-cookie.js   ← CLI 入口（一般用这个）
    └── node_modules/
```

---

## 安装插件（一次性操作）

1. 打开 Chrome，地址栏输入 `chrome://extensions/`
2. 右上角开启 **「开发者模式」**
3. 点击 **「加载已解压的扩展程序」**
4. 选择 `extension/` 目录

安装后，工具栏会出现 🍪 图标。

---

## 使用流程

### 第一次使用：连接服务器

1. 点击工具栏 🍪 图标打开 popup
2. 在输入框中确认地址是：
   ```
   wss://workspacej9jjy0b2zdgg0ebafo-8081.gz.cloudide.woa.com
   ```
3. 点击 **「连接」** 按钮
4. 状态栏变绿（「已连接」）即成功

> 注意：WS 服务器只在运行 `get-cookie.js` 期间存在。需要先运行命令，再确保插件已连接。

---

### 每次获取 Cookie

在服务端（沙箱机器）运行：

```bash
cd /root/.openclaw/workspace/cookie-grabber/server
node get-cookie.js https://target-website.com
# 或附加说明
node get-cookie.js https://github.com "获取 GitHub 登录态"
```

然后：
1. Chrome 插件图标出现 **「!」** 提示
2. 点击图标打开 popup → 看到授权请求 → 点击 **「✅ 同意」**
3. 自动打开目标网站
4. 在该标签页登录完成后，回到插件 popup
5. 点击 **「🚀 已登录，提交 Cookie」**
6. CLI 打印出 Cookie 并退出

---

## 安全说明

- 插件只会连接 `*.gz.cloudide.woa.com` 域名下的 WS 服务器
- 每次授权前都会显示目标网站，由用户确认
- 不会在后台自动上报任何数据
- Cookie 只通过命令行打印，不存储到任何文件
