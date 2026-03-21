@echo off
REM ─────────────────────────────────────────────────────────────────────────
REM deploy.bat  –  Run on Windows to build, push, and deploy to the server
REM Requires: git, npm, ssh configured for the production server
REM ─────────────────────────────────────────────────────────────────────────

echo ==================================================
echo  AD^&D Manager – Windows Deploy
echo ==================================================

REM ── 1. Build React app locally ────────────────────────────────────────────
echo.
echo [1/4] Building React app...
call npm run build
if %ERRORLEVEL% neq 0 (
  echo ERROR: Build failed. Aborting deploy.
  exit /b 1
)
echo       Build OK

REM ── 2. Stage and commit any pending changes ───────────────────────────────
echo.
echo [2/4] Committing and pushing to GitHub...
git add -A
git diff --cached --quiet && (
  echo       Nothing new to commit
) || (
  git commit -m "chore: deploy build"
)
git push origin main
if %ERRORLEVEL% neq 0 (
  echo ERROR: git push failed. Check your SSH/GitHub credentials.
  exit /b 1
)
echo       Pushed to GitHub OK

REM ── 3. SSH into server and run deploy.sh ─────────────────────────────────
echo.
echo [3/4] Connecting to server and running deploy.sh...
REM Force-reset any diverged/dirty server repo before running deploy.sh.
REM This handles the case where files were edited directly on the server.
ssh ubuntu@158.180.63.20 "cd /var/www/adnd-manager && git fetch --all && git reset --hard origin/main && bash /var/www/adnd-manager/deploy.sh"
if %ERRORLEVEL% neq 0 (
  echo ERROR: Remote deploy failed. Check server logs with: ssh ubuntu@158.180.63.20
  exit /b 1
)

REM ── 4. Done ───────────────────────────────────────────────────────────────
echo.
echo [4/4] Done!
echo ==================================================
echo  App is live at: http://158.180.63.20
echo ==================================================
echo.
pause
