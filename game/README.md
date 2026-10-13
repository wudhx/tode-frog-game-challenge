# Tode the Frog — 3D Browser Game

> JetBrains Academy「Build Your Game Challenge」参赛作品

一个用 **Three.js** 打造的 3D 浏览器生存游戏。你将操控青蛙 Tode，在怪物浪潮中跳跃闪避、用范围冲击波清场，尽可能活得更久、拿更高分。

## 在线试玩

> 🔗 部署后在此填写链接

## 玩法

| 操作 | 按键 |
|---|---|
| 移动（跳跃式） | ↑ ↓ ← → |
| 范围攻击 | `Space` |
| 重新开始（Game Over 后） | `Space` |

**规则**
- 每 10 秒 +1 分（生存得分）
- 每击杀 1 个敌人 +10 分
- 被任何敌人碰到即 Game Over
- 分数越高，敌人刷新越快、移动越快——但 Tode 的速度和攻击范围也会小幅提升（敌人成长略快于玩家）

## 技术栈

- **Three.js** 0.181 — 3D 渲染、GLTF 模型加载
- **Vite** 7 — 开发服务器与打包
- **JavaScript (ES Modules)** — 纯原生，无框架

## 项目结构

```
game/
├── index.html               入口页面
├── public/
│   ├── models/              3D 模型（tode / enemy / small_house）
│   └── tode.svg             网站图标
└── src/
    ├── main.js              主入口：场景装配 + 游戏循环
    ├── style.css            计分 UI 与 Game Over 遮罩样式
    └── components/
        ├── Camera.js        跟随玩家的透视相机
        ├── Renderer.js      WebGL 渲染器
        ├── Player.js        Tode：输入队列 + 跳跃动画
        ├── Enemy.js         敌人：四角生成 + 追踪玩家
        ├── Map.js           棋盘格地面
        ├── House.js         随机房屋障碍物 + 碰撞
        ├── Attack.js        范围攻击 + 冷却 + 视觉反馈
        ├── Score.js         计分逻辑与顶部 UI
        └── Difficulty.js    随分数动态缩放难度
```

## 核心实现要点

**跳跃式移动**：每次移动不是瞬移，而是用进度值 `t ∈ [0,1]` 驱动；水平位置线性插值，垂直高度用 `Math.sin(t * π)` 生成抛物线弧线，落地时高度归零。

**碰撞检测**：不使用包围盒（对圆润角色太粗糙），而是用「最小距离常量」做圆形碰撞判定，并区分敌人-敌人、敌人-玩家、实体-房屋三类规则。

**动态难度**：由当前分数推出难度因子 `1 + score × 0.02`（上限 4），线性缩放刷新间隔、移动速度、攻击冷却与范围；敌人参数增幅刻意略高于玩家，保证挑战始终存在。

**AI 辅助开发**：整个项目在 WebStorm 中使用 JetBrains Junie（AI Coding Agent）协作完成，由开发者负责拆解需求、审查生成代码、调参与验证效果。

## 本地运行

```bash
cd game
npm install
npm run dev      # 开发服务器 → http://localhost:5173
npm run build    # 生产构建 → dist/
```

## 素材致谢

- `enemy.glb` — Armabee Evolved by Quaternius（Public Domain）via [Poly Pizza](https://poly.pizza/m/GcttdvsqsQ)
- `small_house.glb` — Small House by Jarlan Perez（CC-BY）via [Poly Pizza](https://poly.pizza/m/053kskrV4U_)
- 课程与 `tode.glb` — [JetBrains Academy](https://academy.jetbrains.com/course/30327)
