from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


project_root = Path(SPECPATH).resolve().parent
backend_dir = project_root / "backend"
frontend_dist = project_root / "frontend" / "dist"

hiddenimports = []
for package in ("fastapi", "h2", "httpx", "nodes", "providers", "pydantic", "uvicorn"):
    hiddenimports.extend(collect_submodules(package))

a = Analysis(
    [str(backend_dir / "desktop_entry.py")],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[(str(frontend_dist), "frontend/dist")],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="inux-canvas-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="inux-canvas-backend",
)
