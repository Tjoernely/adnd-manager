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
    echo ERROR: server\public\index.html not found - check vite.config.ts outDir
    pause
    exit /b 1
)

echo === Step 3: Upload index.html only ===
scp -i C:\DnD_manager_app\ssh-key-2026-03-11.key server\public\index.html ubuntu@158.180.63.20:/var/www/adnd-manager/server/public/index.html
if errorlevel 1 (
    echo FAILED: index.html upload
    pause
    exit /b 1
)

echo === Step 4: Upload assets folder only ===
scp -i C:\DnD_manager_app\ssh-key-2026-03-11.key -r server\public\assets ubuntu@158.180.63.20:/var/www/adnd-manager/server/public/
if errorlevel 1 (
    echo FAILED: assets upload
    pause
    exit /b 1
)

echo === Step 5: Restart PM2 ===
ssh -i C:\DnD_manager_app\ssh-key-2026-03-11.key ubuntu@158.180.63.20 "pm2 restart adnd-backend --update-env"

echo === Deploy complete ===
pause
