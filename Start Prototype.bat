@echo off
rem Opens Ocarina Rhythm Pass. If its local server is already running, just opens the page.
curl -s -o nul http://localhost:5200/ && (start "" http://localhost:5200/ & exit /b)
cd /d "%~dp0"
start "" http://localhost:5200/
rem Close this window to stop the prototype.
node serve.mjs
