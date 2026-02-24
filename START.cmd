@echo off
chcp 65001 >nul
title Exchange Web Admin
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-WebAdmin.ps1"
if %ERRORLEVEL% NEQ 0 pause

