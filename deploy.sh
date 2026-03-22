#!/bin/bash
set -e

cd /var/www/adnd-manager
git fetch origin
git reset --hard origin/main

npm install
cd server && npm install && cd ..
npm run build
