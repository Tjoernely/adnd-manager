@echo off
echo === Step 1: Building frontend ===
call npm run build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)

echo === Step 2: Verify build output ===
if not exist "server\public\index.html" (
    echo ERROR: server\public\index.html not found after build
    echo Check vite.config.ts outDir setting
    pause
    exit /b 1
)

echo === Step 3: Upload to server ===
scp -i C:\DnD_manager_app\ssh-key-2026-03-11.key server\public\index.html ubuntu@158.180.63.20:/var/www/adnd-manager/server/public/index.html
if errorlevel 1 (
    echo SCP index.html FAILED
    pause
    exit /b 1
)
scp -i C:\DnD_manager_app\ssh-key-2026-03-11.key -r server\public\assets ubuntu@158.180.63.20:/var/www/adnd-manager/server/public/
if errorlevel 1 (
    echo SCP assets FAILED
    pause
    exit /b 1
)

echo === Step 4: Restart backend ===
ssh -i C:\DnD_manager_app\ssh-key-2026-03-11.key ubuntu@158.180.63.20 "pm2 restart adnd-backend --update-env"
if errorlevel 1 (
    echo PM2 restart FAILED
    pause
    exit /b 1
)

echo === Deploy complete ===
pause
