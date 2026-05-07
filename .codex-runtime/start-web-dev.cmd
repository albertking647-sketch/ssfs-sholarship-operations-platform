@echo off
cd /d "C:\Users\Lenovo\Documents\Code Space\ssfs-scholarship-operations-hub"
npm.cmd --workspace apps/web run dev > .codex-runtime\web-dev.log 2>&1
