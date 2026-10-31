@echo off
cd /d "%~dp0.."
if not exist logs mkdir logs
call pnpm worker >> logs\worker.log 2>&1
