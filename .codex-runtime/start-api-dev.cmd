@echo off
cd /d "C:\Users\Lenovo\Documents\Code Space\ssfs-scholarship-operations-hub"
npm.cmd --workspace apps/api run dev > .codex-runtime\api-dev.log 2>&1
