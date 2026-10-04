@echo off
rem Jauvex on Windows: double-click this, or run it in a terminal. start.ps1 does the work; this passes PowerShell's script policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
