@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo 请先双击 01_install.cmd 安装依赖。
  pause
  exit /b 1
)
".venv\Scripts\python.exe" pilot_gui.py
if errorlevel 1 (
  echo 程序未正常启动，请保留窗口中的错误信息并反馈。
  pause
)
