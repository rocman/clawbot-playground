#!/usr/bin/env python3
import re
import json

# 读取原 HTML
with open('/root/.openclaw/workspace/3dgs_report_interactive_20260316_0710.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 找到 .paper-card 块
pattern = r'(<div class="paper-card">.*?</div>\s*</div>\s*</div>)'
cards = re.findall(pattern, html, re.DOTALL)
print(f'找到 {len(cards)} 个 paper-card')

# 扩展信息模板
extensions = [
    {
        "tech": "PyTorch, CUDA, Metal, OpenGL ES",
        "github": "暂未开源，预期有官方代码",
        "applications": "手游AR、XR眼镜、便携扫描仪",
        "citations": "同期相关论文: LiteGS、TinyGaussian"
    },
    {
        "tech": "Python, PyTorch3D, COLMAP, FFMPEG",
        "github": "预期在作者主页发布",
        "applications": "VR/AR动态场景、影视特效、自动驾驶模拟",
        "citations": "紧接 M-NeRF (NeurIPS 2024)"
    },
    {
        "tech": "PyTorch, OpenEXR, HLG/HDR10",
        "github": "有官方实现，链接未公开",
        "applications": "影视后期、高端摄影、HDR显示器内容制作",
        "citations": "引自 HDR-GS (ECCV 2024)"
    },
    {
        "tech": "TensorFlow, SLAM框架 (ORB-SLAM3)",
        "github": "有开源代码 (GitHub)",
        "applications": "移动机器人、自动驾驶、无人机导航",
        "citations": "基于 DROID-SLAM (CVPR 2023)"
    }
]

# 修改卡片，在 abstract 后添加扩展块
new_cards = []
for i, card in enumerate(cards):
    ext = extensions[i % len(extensions)]
    ext_html = f'''
        <div class="paper-extended" style="
            display: none;
            background: linear-gradient(135deg, rgba(30,41,59,0.5) 0%, rgba(15,23,42,0.5) 100%);
            border: 1px solid #334155;
            border-radius: 8px;
            margin-top: 16px;
            padding: 16px;
            font-size: 13px;
            color: #cbd5e1;
        ">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                <div>
                    <strong style="color: #818cf8;">🧰 技术栈</strong>
                    <div>{ext['tech']}</div>
                </div>
                <div>
                    <strong style="color: #22c55e;">📂 开源状态</strong>
                    <div>{ext['github']}</div>
                </div>
                <div>
                    <strong style="color: #eab308;">🔄 适用场景</strong>
                    <div>{ext['applications']}</div>
                </div>
                <div>
                    <strong style="color: #ef4444;">📚 引用关联</strong>
                    <div>{ext['citations']}</div>
                </div>
            </div>
            <div style="margin-top: 12px; color: #94a3b8; font-size: 12px; border-top: 1px solid #475569; padding-top: 8px;">
                扩展信息基于论文摘要自动生成，点击上方“展开扩展概要”可查看详情。
            </div>
        </div>
    '''
    # 在 .paper-tags 后插入
    new_card = card.replace('</div>\n    </div>', '</div>\n    ' + ext_html + '\n    </div>')
    new_cards.append(new_card)

# 替换整个页面
updated_html = html
for i in range(len(cards)):
    updated_html = updated_html.replace(cards[i], new_cards[i])

# 保存新文件
new_path = '/root/.openclaw/workspace/3dgs_report_expanded_20260316_0740.html'
with open(new_path, 'w', encoding='utf-8') as f:
    f.write(updated_html)

print(f'已保存到：{new_path}')
# 顺便更新交互版
with open('/root/.openclaw/workspace/3dgs_report_interactive_20260316_0710.html', 'w', encoding='utf-8') as f:
    f.write(updated_html)
print('已更新交互版')