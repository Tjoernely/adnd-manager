@echo off
echo === Building frontend ===
call npm run build
if errorlevel 1 (
    echo Build FAILED
    exit /b 1
)
echo === Clearing old bundle from server ===
ssh -i C:\DnD_manager_app\ssh-key-2026-03-11.key ubuntu@158.180.63.20 "rm -f /var/www/adnd-manager/server/public/assets/index-*.js /var/www/adnd-manager/server/public/assets/index-*.css"
echo === Uploading new bundle ===
scp -i C:\DnD_manager_app\ssh-key-2026-03-11.key -r dist\* ubuntu@158.180.63.20:/var/www/adnd-manager/server/public/
echo === Restarting backend ===
ssh -i C:\DnD_manager_app\ssh-key-2026-03-11.key ubuntu@158.180.63.20 "pm2 restart adnd-backend --update-env"
echo === Deploy complete ===
