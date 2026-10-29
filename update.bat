@echo off
rem IZM-NewTab updater: the actual work is in tools\update.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update.ps1"
