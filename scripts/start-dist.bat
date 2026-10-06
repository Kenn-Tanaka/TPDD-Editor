@echo off
chcp 65001 > nul
setlocal

echo ====================================================
echo   思考展開図エディタ (TPDD) 起動スクリプト
echo ====================================================

cd /d "%~dp0\.."

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [エラー] Node.js がインストールされていないか、PATHが通っていません。
    echo 本アプリケーションの実行には Node.js (v18以上推奨) が必要です。
    pause
    exit /b 1
)

if not exist "dist\index.html" (
    echo [情報] 配布用成果物 (dist) が見つかりません。ビルドを実行します...
    call npm run build
    if %errorlevel% neq 0 (
        echo [エラー] ビルドに失敗しました。
        pause
        exit /b 1
    )
)

echo 配布サーバーを起動します...
call npm run serve:dist

pause
