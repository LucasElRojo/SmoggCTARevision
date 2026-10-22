@echo off
rem Builds CTA Checker for Windows, macOS and Linux into dist\.
cd /d "%~dp0"
set CGO_ENABLED=0
set GOOS=windows& set GOARCH=amd64& go build -ldflags "-s -w" -o dist\CTAChecker.exe . || exit /b 1
set GOOS=darwin& set GOARCH=arm64& go build -ldflags "-s -w" -o dist\CTAChecker-mac . || exit /b 1
set GOOS=darwin& set GOARCH=amd64& go build -ldflags "-s -w" -o dist\CTAChecker-mac-intel . || exit /b 1
set GOOS=linux& set GOARCH=amd64& go build -ldflags "-s -w" -o dist\CTAChecker-linux . || exit /b 1
echo Listo: dist\
