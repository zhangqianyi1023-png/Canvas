# TapNow Canvas 对齐实施基线

当前项目根目录：`/Users/qianyi/Documents/InUx_Canvas`

## 范围

只对齐 Canvas 工作区能力：节点、连线、素材上传、Agent 引用、图片/视频/音频生成与编辑、历史恢复、Stack、Playlist、批量下载、Library、Elements 和 Templates。

不纳入本阶段：TapTV、社区、账户计费、团队权限和产品外部运营能力。

## 实施顺序

1. Canvas Core：统一节点协议、引用关系、任务状态、复制/撤销/重做和恢复。
2. Node Toolbar：统一图片、视频、音频操作入口，生成结果不覆盖源节点。
3. Canvas Agent：选择节点、`@` 引用、计划确认、执行并回写结果节点。
4. Canvas Efficiency：History、搜索、颜色标记、Stack、批量下载。
5. Media Workflow：Playlist、Library、Elements、Templates。
6. Advanced：3D 节点与 3D Viewfinder。

## 当前提交

第一批基础代码位于 `frontend/src/canvasNodeContract.js` 和 `frontend/src/canvasOperationRunner.js`，只处理可序列化的图数据，不耦合具体模型供应商。

第二阶段从 `frontend/src/canvasToolbarActions.js` 开始：已将当前已实现操作与 TapNow 目标操作统一登记；未实现的扩图、擦除、抠图、增强、快速切分和 Playlist 不会提前显示为可用按钮。
