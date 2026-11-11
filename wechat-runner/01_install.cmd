@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo 正在检查 Python 3.13，请保持联网。
py -3.13 -c "import sys; assert sys.version_info[:2] == (3,13)" >nul 2>&1
if errorlevel 1 (
  echo 未找到 Python 3.13。请先从 Python 官网安装 3.13 系列的 Windows 64位完整版。
  echo https://www.python.org/downloads/windows/
  echo 安装后重新双击本文件。请不要在压缩包内部运行。
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" py -3.13 -m venv ".venv"
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip install --index-url https://pypi.org/simple --only-binary=:all: --require-hashes -r requirements.txt
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -c "import tkinter, uiautomation, PIL"
if errorlevel 1 goto failed
echo 安装完成。下一步双击 02_start.cmd，先选择资料包并执行“仅检查”。
pause
exit /b 0
:failed
echo 安装未完成。请保留本窗口的错误信息，发给我继续处理；此步骤没有操作微信。
pause
exit /b 1
