import json

with open('3dgs_20260316.json') as f:
    data = json.load(f)

digests = {
"OmniStream: Mastering Perception, Reconstruction and Action in Continuous Streams": (
    "★★★☆☆",
    "提出 OmniStream，一个统一的流式视觉骨干网络，旨在让视觉智能体在连续视频流中同时完成语义感知、几何重建和动作决策三项任务。核心创新是引入因果时空注意力机制和三维旋转位置编码（3D-RoPE），支持逐帧在线推理，无需访问未来帧。整体偏向视觉基础模型统一化，3DGS 并非其核心，但对实时空间重建能力的整合具有参考意义。",
    "可选读。面向流式感知的通用视觉框架，3DGS 相关性较弱，适合关注实时重建与决策融合方向的读者。",
),
"DreamVideo-Omni: Omni-Motion Controlled Multi-Subject Video Customization with Latent Identity Reinforcement Learning": (
    "★★★☆☆",
    "针对扩散模型视频生成中多主体身份保持与细粒度运动控制难以兼顾的痛点，提出 DreamVideo-Omni 框架。通过渐进式两阶段训练——先学语义相机控制，再联合优化主体动作——实现全方位运动控制下的多主体视频定制，并引入潜在身份强化学习缓解身份退化问题。与 3DGS 关联有限，属生成视频方向的扎实工作。",
    "可选读。生成视频方向的扎实工作，与 3DGS 相关性有限，适合关注动态内容生成和视频定制的读者。",
),
"Spatial-TTT: Streaming Visual-based Spatial Intelligence with Test-Time Training": (
    "★★★★☆",
    "提出 Spatial-TTT，通过测试时训练（TTT）机制让模型在推理阶段持续适应新的空间视频流输入。核心思路是用快权重子集动态捕捉和组织空间证据，解决长视频流中空间信息如何被有效选择、保留和更新的核心难题——这不单是上下文窗口问题，更是空间记忆的组织问题。对 3DGS 动态场景重建有借鉴意义。",
    "值得关注。流式空间智能的新思路，TTT 机制赋予模型持续学习能力，对动态 3D 重建和长序列场景理解方向的研究者有参考价值。",
),
"SceneAssistant: A Visual Feedback Agent for Open-Vocabulary 3D Scene Generation": (
    "★★★★☆",
    "提出 SceneAssistant，一个以视觉反馈为驱动的智能体框架，用于开放词汇的三维场景生成。系统整合现代 3D 对象生成模型与视觉语言模型的空间推理能力，突破现有方法依赖预定义空间关系的局限，支持从自然语言描述中自由生成无约束、开放词汇的 3D 场景，直接应用于数字内容创作和游戏资产生产流程。",
    "值得关注。开放词汇 3D 场景生成的实用框架，LLM+3D 生成的结合思路有启发性，对数字内容创作、游戏资产生成方向值得一读。",
),
"Portfolio of Solving Strategies in CEGAR-based Object Packing and Scheduling for Sequential 3D Printing": (
    "★☆☆☆☆",
    "研究多核 CPU 并行化 CEGAR-SEQ 算法，求解顺序 3D 打印中物体排列与调度的组合优化问题，将其编码为线性算术公式并行求解。属于 3D 打印工艺规划领域的运筹学研究，与 3D Gaussian Splatting 无直接关联，系搜索词误匹配收录。",
    "⚠️ 与 3DGS 不相关。3D 打印调度优化方向，误收录，可跳过。",
),
"Conformalized Data-Driven Reachability Analysis with PAC Guarantees": (
    "★☆☆☆☆",
    "提出 CDDR 框架，通过共形预测方法为数据驱动的可达集分析提供概率近似正确覆盖保证，无需已知噪声界或系统 Lipschitz 常数，适用于线性、非线性和混合系统。这是控制理论领域的工作，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。控制论/安全验证方向，误收录，可跳过。",
),
"SaPaVe: Towards Active Perception and Manipulation in Vision-Language-Action Models for Robotics": (
    "★★★☆☆",
    "提出 SaPaVe，端到端机器人框架，将语义驱动的主动视觉感知与视角无关的操作执行统一学习。通过解耦相机动作和机械臂动作，并采用自底向上的训练策略——先在大规模数据集上训练语义相机控制，再用混合数据联合优化两类动作——在数据高效的前提下同时习得两项能力。",
    "可选读。机器人主动感知与 VLA 模型结合的实用框架，3DGS 相关性较弱，适合机器人感知方向读者。",
),
"Optimal Discrimination of Gaussian States by Gaussian Measurements": (
    "★☆☆☆☆",
    "研究量子信息中高斯测量是否足以最优区分高斯态，基于最大相对熵推导判断条件，并给出最优测量方案。纯量子信息理论工作，与 3DGS 完全无关，系误收录。",
    "⚠️ 与 3DGS 不相关。量子信息理论方向，误收录，可跳过。",
),
"A Quantitative Characterization of Forgetting in Post-Training": (
    "★☆☆☆☆",
    "从理论角度分析生成模型持续后训练中灾难性遗忘的机理，在二模混合高斯假设下证明质量遗忘和旧分量漂移两种遗忘形式的发生条件。机器学习理论工作，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。持续学习/遗忘理论方向，误收录，可跳过。",
),
"O3N: Omnidirectional Open-Vocabulary Occupancy Prediction": (
    "★★★★☆",
    "提出 O3N，首个纯视觉端到端全向开放词汇三维占用预测框架，将全向视觉嵌入与开放词汇语义对齐，解决现有方法受限于视角范围和预定义类别的瓶颈。对自动驾驶和具身智能体在开放世界中实现全面安全感知至关重要，与 3DGS 的三维场景表达存在密切关联。",
    "值得关注。全向 3D 占用感知的开创性工作，open-vocabulary + omnidirectional 是新兴方向，对自动驾驶和具身智能体方向研究者有直接参考价值。",
),
"ChemSICal-Net: Timing-Controlled Chemical Reaction Network for Successive Interference Cancellation in Molecular Multiple Access": (
    "★☆☆☆☆",
    "在分子通信领域提出化学反应网络（CRN）实现连续干扰消除，用于纳米尺度生物通信中的多址接入问题。纯分子通信与纳米技术方向，与 3DGS 完全无关，系误收录。",
    "⚠️ 与 3DGS 不相关。分子通信方向，误收录，可跳过。",
),
"History state formalism for time series with application to finance": (
    "★☆☆☆☆",
    "将量子力学中的历史态形式主义应用于金融时间序列分析，通过量子相干态嵌入刻画时间序列演化，并引入系统-时间纠缠熵度量有效可区分状态数。量子金融数学方向，与 3DGS 完全无关，系误收录。",
    "⚠️ 与 3DGS 不相关。量子金融方向，误收录，可跳过。",
),
"Hoi3DGen: Generating High-Quality Human-Object-Interactions in 3D": (
    "★★★★☆",
    "提出 Hoi3DGen，针对文本驱动的 3D 人物-物体交互生成。现有方法依赖图像扩散的 Score Distillation 导致 Janus 问题和文本不忠实，本文通过多模态大语言模型策划高质量交互数据集，训练专用生成模型，生成带纹理网格的精确三维交互场景。数据质量驱动而非单靠模型规模是其核心策略，在 AR、XR 和游戏领域有直接应用价值。",
    "值得关注。高质量 3D 人物交互生成，解决了 Janus 问题同时提升文本对齐度，对虚拟形象、AR/XR 内容创作方向值得精读。",
),
"A Complete Graphic Statics for Rigid-Jointed 3D Frames. Part 2: Homology of loops": (
    "★☆☆☆☆",
    "基于代数拓扑同调理论，用胞腔复形描述任意三维刚接框架结构中的力和弯矩，将图解静力学方法扩展到完整的三维刚接结构分析。纯结构力学与代数拓扑方向，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。结构力学方向，误收录，可跳过。",
),
"LoV3D: Grounding Cognitive Prognosis Reasoning in Longitudinal 3D Brain MRI via Regional Volume Assessments": (
    "★★★★☆",
    "提出 LoV3D，针对纵向三维脑部 MRI 的视觉语言模型训练流程。系统读入多时间点的 T1 加权脑部 MRI，在区域层面逐一进行解剖评估，执行纵向对比分析，最终输出有解剖依据的认知预后推理文本，覆盖阿尔茨海默病等神经退行性疾病进展判断。将 3D 视觉理解与语言推理打通，并规避了现有 VLM 在医疗场景中幻觉严重的问题。",
    "值得关注。纵向 3D 医学影像与 VLM 结合是稀缺方向，推理链路设计严谨，对医疗影像 AI 研究者有直接参考价值。",
),
"A Universality Emerging in a Universality: Derivation of the Ericson Transition in Stochastic Quantum Scattering and Experimental Validation": (
    "★☆☆☆☆",
    "在随机量子散射理论中推导 Ericson 过渡区的解析公式，证明混沌多体系统散射截面趋向高斯随机函数，填补了六十余年缺乏严格解析推导的空白并通过实验验证。量子物理理论工作，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。量子散射理论方向，误收录，可跳过。",
),
"NBAvatar: Neural Billboards Avatars with Realistic Hand-Face Interaction": (
    "★★★★☆",
    "提出 NBAvatar，用于逼真渲染手脸交互场景下的头部数字人变形。创新性地将定向平面图元（billboard primitives）的显式几何表达与神经渲染的隐式外观表达相结合，在保持时间一致几何的同时捕捉细粒度外观细节。实验表明模型能隐式学习手触碰脸时的颜色变化（遮挡阴影、皮肤色变等），在高保真数字人渲染中具有实用价值。",
    "值得关注。显隐式混合表达 + 手脸交互渲染的细分方向，数字人/虚拟主播应用直接，对关注高保真头部渲染的研究者值得精读。",
),
"Noise Correlations as a Resource in Pauli-Twirled Circuits": (
    "★☆☆☆☆",
    "研究随机编译（RC）在具有时空噪声相关性的量子电路中的表现，证明在 Clifford 电路中噪声相关性能意外提升电路保真度，并给出解析表达式。量子计算误差缓解方向，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。量子计算方向，误收录，可跳过。",
),
"On Exotic Materials in 3D Linear Elasticity with High Symmetry Classes": (
    "★☆☆☆☆",
    "研究三维线弹性中的奇异材料——在特定载荷下力学响应呈现高于内禀对称性的材料，推导其判别条件，为设计能兼容矛盾力学要求的超材料提供理论基础，如在各向异性介质中实现方向等向杨氏模量。材料力学理论方向，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。材料力学方向，误收录，可跳过。",
),
"Nyxus: A Next Generation Image Feature Extraction Library for the Big Data and AI Era": (
    "★★☆☆☆",
    "介绍 Nyxus，一个面向大数据和 AI 时代的高性能图像特征提取库，解决现有工具在 TB/PB 级图像数据集上计算效率不足、跨领域特征难以统一比较的问题，支持 CPU/GPU 加速和深度学习流程集成。与 3DGS 直接关联度低，属通用图像分析基础工具。",
    "一般性工作。图像特征提取工程库，3DGS 相关性弱，大规模图像分析流水线工程师可参考，研究向读者可跳过。",
),
"Pano360: Perspective to Panoramic Vision with Geometric Consistency": (
    "★★★★☆",
    "提出 Pano360，将传统多视角透视图像的拼接问题提升到三维光度测量空间，通过引入基于 Transformer 的架构实现全局三维感知和特征聚合，生成几何一致的全景图像。解决了现有方法在弱纹理、大视差、重复纹理场景下失真和错位的顽疾，与 3DGS 的场景表达和全景输入预处理存在直接关联。",
    "值得关注。将拼接问题提升到 3D 光度测量空间是明智设计，对全景重建、360 度场景理解和 3DGS 数据预处理方向均有参考价值。",
),
"What is a minimum work transition in stochastic thermodynamics?": (
    "★☆☆☆☆",
    "重新审视随机热力学中最小功转变的概念，在扩散过程模型下证明最优控制问题的良定义需引入速度限制约束，由此区分最优急速均衡化与最小功转变两类本质不同的问题。随机热力学与最优控制理论方向，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。随机热力学方向，误收录，可跳过。",
),
"Ada3Drift: Adaptive Training-Time Drifting for One-Step 3D Visuomotor Robotic Manipulation": (
    "★★★★☆",
    "针对扩散策略推理延迟高、单步流匹配方法丢失多模态动作分布的双重痛点，提出 Ada3Drift。关键洞察是机器人系统离线训练算力充裕而在线推理需实时响应的算力不对称性——利用训练阶段的充裕算力引入自适应漂移机制恢复多模态保真度，从而在单步推理的同时保留多样动作模式，将 3D 视觉运动策略推进到实时可用水平。",
    "值得关注。机器人单步生成保多模态分布的思路有创意，离线-在线算力非对称利用的视角值得借鉴，对机器人学习和具身智能方向值得精读。",
),
"Interference-Based 3D Optical Cold Damping of a Levitated Nanoparticle": (
    "★☆☆☆☆",
    "演示利用单光束路径内的干涉增强光力，实现悬浮纳米粒子三个质心自由度的同时光学冷阻尼，无需额外光束路径或阱重新配置。精密测量与量子光力学方向，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。量子光力学方向，误收录，可跳过。",
),
"AstroSplat: Physics-Based Gaussian Splatting for Rendering and Reconstruction of Small Celestial Bodies": (
    "★★★★★",
    "提出 AstroSplat，将物理反射率模型（行星表面光照模型）显式融入 Gaussian Splatting 框架，用于小天体（小行星等）的高保真表面重建与渲染。现有 3DGS 的球谐函数参数化仅建模外观，不区分材质与光照，在复杂光照条件下重建质量受限。AstroSplat 通过显式建模材质-光照交互显著提升重建精度，直接服务于航天任务规划、导航与科学分析，同时为一般场景的物理感知 3DGS 重建提供了可复用的框架范式。",
    "⭐ 强烈推荐精读。物理渲染融入 3DGS 是清晰的创新路径，不局限于航天应用，对 3DGS 材质感知重建方向有直接贡献，框架可迁移性强。",
),
"Energy Prediction on Sloping Ground for Quadruped Robots": (
    "★☆☆☆☆",
    "研究地形坡度和行进方向对四足机器人能耗的影响规律，提出仅依赖机载标准传感器的简洁能量预测模型，通过商用四足机器人的野外实测验证，可用于户外任务的能效规划。机器人运动能效方向，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。机器人运动规划方向，误收录，可跳过。",
),
"Bayesian Model Calibration with Integrated Discrepancy: Addressing Inexact Dislocation Dynamics Models": (
    "★☆☆☆☆",
    "提出一种贝叶斯模型校准新方法，将模型差异函数嵌入仿真器内部而非作为独立外部项，通过高斯过程代理模型保证计算可行性，应用于位错动力学模型的参数校准。计算力学与不确定性量化方向，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。计算力学方向，误收录，可跳过。",
),
"Revealing 3D orientation and strain heterogeneity in calcite generated by bio-cementation": (
    "★☆☆☆☆",
    "联合使用微 CT、3D X 射线衍射和暗场 X 射线显微镜，对生物固化形成的方解石键进行无损三维表征，揭示其取向织构和弹性应变异质性，为理解生物固化机理提供定量依据。材料科学与土木工程方向，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。材料表征方向，误收录，可跳过。",
),
"InSpatio-WorldFM: An Open-Source Real-Time Generative Frame Model": (
    "★★★★★",
    "提出 InSpatio-WorldFM，一个开源实时空间智能帧模型。与视频世界模型逐序列生成不同，本模型采用逐帧独立生成范式，通过显式 3D 锚点和隐式空间记忆强制多视角空间一致性，在保持全局场景几何的同时维持细粒度视觉细节。低延迟、开源、实时是三大亮点，对 3DGS 实时渲染与场景重建既是竞争方案也是互补工具。",
    "⭐ 强烈推荐精读。开源+实时+空间一致性三者兼顾，是世界模型领域少见的工程友好型工作，对关注实时 3D 场景生成和替代 3DGS 表达的研究者有重要参考价值。",
),
"Multi-branch Shell Models of Two-Dimensional Turbulence exhibit Dual Energy-Enstrophy Cascades": (
    "★☆☆☆☆",
    "提出多分支壳模型以再现二维湍流的热谱和双级联现象（能量逆级联与涡量正级联），突破传统壳模型无法显示双级联的局限，并通过数值实验验证稳态双级联的出现。流体力学与湍流理论方向，与 3DGS 无关，系误收录。",
    "⚠️ 与 3DGS 不相关。湍流理论方向，误收录，可跳过。",
),
}

matched = 0
for p in data['papers']:
    title = p['title'].strip().replace('Paper Title: ', '')
    key = next((k for k in digests if k in title or title in k or title == k), None)
    if key:
        stars, core, rec = digests[key]
        p['digest'] = f'{stars}\n核心思想：{core}\n\n{rec}'
        matched += 1
    else:
        print(f'[未匹配] {title[:70]}')

with open('3dgs_20260316.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

from collections import Counter
dist = Counter(p['digest'].split('\n')[0] for p in data['papers'])
for k,v in sorted(dist.items(), reverse=True):
    print(f'  {k}: {v}篇')
print(f'\n✅ 完成，匹配 {matched}/30 篇')
