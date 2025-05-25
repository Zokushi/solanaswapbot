@echo off
start "Trading Bot Server" cmd /k "yarn server"
timeout /t 2
start "Trading Bot CLI" cmd /k "yarn cli" 