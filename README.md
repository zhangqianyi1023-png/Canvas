# InUx Canvas

InUx Canvas 是一个本地优先的 AI 画布应用。开发时由 React 前端和本地 FastAPI 后端组成，主要面向 Web 使用。

## 项目结构

- `frontend/`：React + Vite 画布前端。
- `backend/`：FastAPI API 服务、模型供应商适配、本地媒体存储、任务中心和测试。
- `backend/data/`：开发环境中的本地运行配置和数据库。
- `backend/uploads/`：开发环境中的本地上传和生成媒体。

`backend/data/` 和 `backend/uploads/` 应保持在 Git 管理之外。

## 本地开发

安装前端依赖：

```bash
npm --prefix frontend install
```

安装 Canvas Copilot 使用的独立 DeepSeek Harness 运行环境：

```bash
npm --prefix backend/copilot-runtime install
```

创建后端虚拟环境：

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

启动后端：

```bash
cd backend
../backend/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

启动前端：

```bash
npm --prefix frontend run dev
```

打开：

```text
http://127.0.0.1:5173/
```

## API 供应商配置

用户可以在应用设置页配置供应商：

- 供应商名称
- 协议
- Base URL
- API Key
- 可用模型
- 各能力的默认模型

应用不应强依赖某一个特定的 API 中转平台。APIMart 仍然是一个受支持的供应商选项，但不是应用运行的必要条件。

不要提交真实 API Key。开发环境的密钥应保存在被忽略的本地数据文件中，例如 `backend/data/runtime-settings.json`。

## 本地数据

开发环境中：

- 上传和生成的媒体：`backend/uploads/`
- 运行配置和任务历史：`backend/data/`

## 测试

后端：

```bash
PYTHONPATH=backend:. python3 -m unittest discover -s backend/tests -v
```

前端：

```bash
npm --prefix frontend test -- --run
```

前端生产构建：

```bash
npm --prefix frontend run build
```
