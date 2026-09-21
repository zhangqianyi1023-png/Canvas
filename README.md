# InUx Canvas

InUx Canvas is a local-first AI canvas application. It runs as a React frontend with a local FastAPI backend during development, and is intended for Web use.

## What It Contains

- `frontend/`: React + Vite canvas UI.
- `backend/`: FastAPI API service, provider adapters, local media storage, task center, and tests.
- `backend/data/`: local runtime settings and databases in development.
- `backend/uploads/`: local uploaded and generated media in development.

`backend/data/` and `backend/uploads/` should stay out of git.

## Local Development

Install frontend dependencies:

```bash
npm --prefix frontend install
```

Install the isolated DeepSeek Harness runtime used by Canvas Copilot:

```bash
npm --prefix backend/copilot-runtime install
```

Create the backend virtual environment:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

Start the backend:

```bash
cd backend
../backend/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Start the frontend:

```bash
npm --prefix frontend run dev
```

Open:

```text
http://127.0.0.1:5173/
```

## API Provider Setup

Users configure providers in the app settings page:

- provider name
- protocol
- Base URL
- API Key
- available models
- default models per capability

The app should not require one specific API relay platform. APIMart remains a supported provider option, but it is not required for the app to run.

Do not commit real API keys. Development keys live in ignored local data files such as `backend/data/runtime-settings.json`.

## Local Data

In development:

- uploaded and generated media: `backend/uploads/`
- runtime settings and task history: `backend/data/`

## Tests

Backend:

```bash
PYTHONPATH=backend:. python3 -m unittest discover -s backend/tests -v
```

Frontend:

```bash
npm --prefix frontend test -- --run
```

Frontend production build:

```bash
npm --prefix frontend run build
```
