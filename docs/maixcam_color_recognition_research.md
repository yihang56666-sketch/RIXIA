# MaixCAM 色块识别开源方案调研

资料核对时间：2026-09-06。以下优先采用 Sipeed 官方 MaixPy/MaixCDK 文档和源码；第三方仓库仅作为实现参考，不代表已验证的官方模型。

## 结论先行

- **纯色块、颜色相对稳定、要求高帧率**：优先 MaixPy `Image.find_blobs()`。这是传统视觉阈值分割，不需要训练模型，延迟/内存开销低，能直接返回色块矩形、像素数等信息。
- **背景复杂、光照变化大、颜色与形状共同决定类别，或需要识别多个实例**：用 MaixHub 在线训练 YOLO 检测模型，或者电脑训练 Ultralytics YOLO 后转换到 MaixCAM。检测模型能返回类别、置信度和边框，但需要数据集、标注和模型转换，速度/内存取决于模型尺寸。
- **只跟踪一个已框选的色块/目标**：MaixPy 自学习 NanoTrack 可以不训练直接框选目标并持续跟踪；它不是颜色分类器，遮挡、重新出现和多目标场景需单独评估。

## 1. 官方无模型方案：`find_blobs`

官方中文文档：
https://github.com/sipeed/MaixPy/blob/main/docs/doc/zh/vision/find_blobs.md

核心 API 示例（MaixPy）：

```python
from maix import image, camera, display

cam = camera.Camera(320, 240)
disp = display.Display()
thresholds = [[0, 80, 40, 80, 10, 80]]  # LAB 红色示例

while 1:
    img = cam.read()
    blobs = img.find_blobs(thresholds, pixels_threshold=500)
    for blob in blobs:
        img.draw_rect(blob[0], blob[1], blob[2], blob[3], image.COLOR_GREEN)
    disp.show(img)
```

关键事实与调参：

- 阈值格式为 LAB `[L_MIN, L_MAX, A_MIN, A_MAX, B_MIN, B_MAX]`；可以同时传多个颜色阈值。
- `pixels_threshold`、`area_threshold` 可过滤小噪声；`roi=[x,y,w,h]` 可限制处理区域，降低误检和耗时。
- 官方推荐用 MaixCAM 内置“找色块”应用点击目标自动取得 LAB 值，再手动微调 L/A/B 范围；调好的阈值可复制到程序。
- 结果是色块的位置和大小，不是语义类别。对阴影、反光、白平衡变化、背景中相近颜色较敏感；可通过固定曝光/白平衡、ROI、形态学/面积过滤改善。

官方 C++ 应用源码（可直接参考或移植）：
https://github.com/sipeed/MaixCDK/tree/main/projects/app_find_blobs

历史 MaixPy 示例（K210/MaixPy v1 API，**不要直接与 MaixCAM MaixPy 4 API 混用**，但算法思路可参考）：
https://github.com/sipeed/MaixPy-v1_scripts/blob/master/machine_vision/demo_find_green_blob.py

## 2. 官方神经网络方案：MaixHub 自定义检测

官方在线训练流程：
https://github.com/sipeed/MaixPy/blob/main/docs/doc/zh/vision/maixhub_train.md

要点：

- 在 MaixHub 新建“图像检测”项目，平台必须选择 **MaixCAM / MaixCAM Pro**（不要选 MaixCAM2）；采集/标注真实场景图片后在线训练。
- 检测模型返回类别、分数和边框；“图像分类”只判断整张图，不给出位置，不适合色块定位。
- 训练/验证集应覆盖不同颜色、背景、距离、角度和光照，并加入无目标图片；官方明确建议用板子采集真实画面并用失败场景补数据。
- MaixCAM/MaixCAM Pro 部署包通常包含 `.mud` + `.cvimodel`；上传到设备 `/root/models`，用 MaixVision 运行包内 `main.py` 或通用运行示例。

官方 YOLO 运行示例与版本要求：
https://github.com/sipeed/MaixPy/blob/main/docs/doc/zh/vision/yolov5.md

MaixPy 已封装 `nn.YOLOv5`、`nn.YOLOv8`、`nn.YOLO11`、`nn.YOLO26`（文档注明 YOLOv8 >= 4.3.0、YOLO11 >= 4.7.0、YOLO26 >= 4.12.5）。典型调用：

```python
detector = nn.YOLO11(model="/root/models/yolo11n.mud", dual_buff=True)
objs = detector.detect(img, conf_th=0.5, iou_th=0.45)
```

官方对默认模型的取舍说明：`yolov8n`、`yolo11n`、`yolo26n` 更轻更快；更大的 `yolov8s`/`yolo11s` 通常精度更高但帧率下降。文档给出的 MaixCAM 常用输入尺寸是 `320x224`，提高分辨率通常提高小目标精度但增加耗时。

## 3. 自己训练 YOLO 后转换

电脑训练指南（官方）：
https://github.com/sipeed/MaixPy/blob/main/docs/doc/zh/vision/customize_model_yolo.md

MaixCAM 手动转换指南（官方）：
https://github.com/sipeed/MaixPy/blob/main/docs/doc/zh/ai_model_converter/maixcam.md

推荐流程：Ultralytics 训练 `best.pt` -> 导出固定输入尺寸 ONNX（常见 320x224）-> 网页转换器或 `tpu-mlir` 转换 -> MaixCAM 部署 `.mud` + `.cvimodel`。MaixCAM 使用 CV181x，模型算子必须在转换器支持范围内；动态输入或未裁剪后处理节点可能导致转换失败/量化误差。模型许可证需自行核对。

## 4. 不训练的单目标跟踪（补充）

官方自学习检测跟踪器：
https://github.com/sipeed/MaixPy/blob/main/docs/doc/zh/vision/self_learn_detector.md

MaixCAM/MaixCAM-Pro 支持 NanoTrack（轻量、速度快），使用内置 `/root/models/nanotrack.mud`，先 `tracker.init(img,x,y,w,h)` 框选色块，再连续 `track()`。它学习的是框内目标外观，不理解“红色/蓝色”语义；目标消失、多个相似色块或大范围变化时不应把它当作色块检测替代品。官方文档中 MixFormerV2 主要列为 MaixCAM2 支持，MaixCAM 应优先 NanoTrack。

## 5. 模型/资源入口

- MaixHub 模型库：https://maixhub.com/model/zoo
- 官方 MaixPy 仓库（MaixCAM Python API、示例和文档）：https://github.com/sipeed/MaixPy
- 官方 MaixCDK（C/C++ SDK、`app_find_blobs` 和 NN 示例）：https://github.com/sipeed/MaixCDK
- 官方 MaixPy 视觉示例目录：https://github.com/sipeed/MaixPy/tree/main/examples/vision

## 6. 选型建议（针对“色块”）

| 场景 | 首选 | 原因/代价 |
|---|---|---|
| 单色、背景对比明显、要最高帧率 | `find_blobs` + LAB 阈值 | 无训练、低资源；需现场调阈值并控制光照 |
| 多种固定颜色、需返回每块位置 | `find_blobs` 多阈值 + ROI/面积过滤 | 代码简单；相近颜色和反光会误检 |
| 色块外观变化大或背景复杂 | MaixHub 自定义 YOLO11n/YOLOv8n | 训练后鲁棒性更好；需采集标注、部署模型，推理较慢 |
| 只需锁定一个人工选中的目标 | NanoTrack | 不训练即可跟踪；不是多目标/颜色分类器 |

建议先做一个 `find_blobs` 基线：记录不同光照下的 LAB 分布、误检率和帧率；只有当阈值方案无法达到目标，再投入自定义 YOLO 数据集和转换流程。无论选择哪条路线，都应在 MaixCAM 实际镜头、曝光和距离下验证，而不要只看电脑端验证集指标。
