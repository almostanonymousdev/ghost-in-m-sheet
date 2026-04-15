@echo off
setlocal enabledelayedexpansion

:: Setup script for Ghost in M'Sheet (Windows)
:: This script downloads and sets up Tweego, SugarCube, and Python if needed

cd /d "%~dp0"

:: Configuration
set TWEEGO_VERSION=2.1.1
set TWEEGO_DIR=tweego-%TWEEGO_VERSION%-windows-x64
set TWEEGO_URL=https://github.com/tmedwards/tweego/releases/download/v%TWEEGO_VERSION%/tweego-%TWEEGO_VERSION%-windows-x64.zip
set TWEEGO_EXE=%TWEEGO_DIR%\tweego.exe

set SUGARCUBE_VERSION=2.37.3
set SUGARCUBE_URL=https://github.com/tmedwards/sugarcube-2/releases/download/v%SUGARCUBE_VERSION%/sugarcube-%SUGARCUBE_VERSION%-for-twine-2.1-local.zip
set SUGARCUBE_DIR=%TWEEGO_DIR%\storyformats
set SUGARCUBE_INSTALLED_DIR=%SUGARCUBE_DIR%\sugarcube-2

echo Setting up Ghost in M'Sheet...

:: Check for Git
echo Checking for Git...
where git >nul 2>&1
if !errorlevel! neq 0 (
    echo Git not found. Attempting to install via winget...
    where winget >nul 2>&1
    if !errorlevel! neq 0 (
        echo Error: Git is required but not installed, and winget is not available.
        echo Please install Git from https://git-scm.com/downloads/win
        exit /b 1
    )
    winget install Git.Git --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo Error: Failed to install Git via winget.
        echo Please install Git manually from https://git-scm.com/downloads/win
        exit /b 1
    )
    echo Git installed. You may need to restart your terminal for PATH changes to take effect.
) else (
    echo Git found.
)

:: Check for Python
echo Checking for Python...
where python >nul 2>&1
if !errorlevel! neq 0 (
    echo Python not found. Attempting to install via winget...
    where winget >nul 2>&1
    if !errorlevel! neq 0 (
        echo Error: Python is required but not installed, and winget is not available.
        echo Please install Python from https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during installation.
        exit /b 1
    )
    winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo Error: Failed to install Python via winget.
        echo Please install Python manually from https://www.python.org/downloads/
        exit /b 1
    )
    echo Python installed. You may need to restart your terminal for PATH changes to take effect.
) else (
    echo Python found.
)

:: Check if Tweego already exists
if exist "%TWEEGO_EXE%" (
    echo Tweego already installed at %TWEEGO_EXE%
    echo Skipping download...
) else (
    echo Tweego not found. Downloading...

    :: Download Tweego using PowerShell
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%TWEEGO_URL%' -OutFile 'tweego.zip' -UseBasicParsing"
    if !errorlevel! neq 0 (
        echo Error: Failed to download Tweego.
        exit /b 1
    )

    :: Extract Tweego
    echo Extracting Tweego...
    powershell -Command "Expand-Archive -Path 'tweego.zip' -DestinationPath '%TWEEGO_DIR%' -Force"
    del tweego.zip

    echo Tweego installed successfully!
)

:: Check if SugarCube already exists with the correct version
set SUGARCUBE_FORMAT_JS=%SUGARCUBE_INSTALLED_DIR%\format.js
set SUGARCUBE_NEEDS_INSTALL=1
if exist "%SUGARCUBE_FORMAT_JS%" (
    powershell -Command "if (Select-String -Path '%SUGARCUBE_FORMAT_JS%' -Pattern '\"version\":\"%SUGARCUBE_VERSION%\"' -Quiet) { exit 0 } else { exit 1 }"
    if !errorlevel! equ 0 (
        echo SugarCube %SUGARCUBE_VERSION% already installed.
        echo Skipping download...
        set SUGARCUBE_NEEDS_INSTALL=0
    ) else (
        echo SugarCube found but not version %SUGARCUBE_VERSION%. Reinstalling...
        rmdir /s /q "%SUGARCUBE_INSTALLED_DIR%"
    )
)
if !SUGARCUBE_NEEDS_INSTALL! equ 1 (
    echo SugarCube not found. Downloading...

    :: Download SugarCube using PowerShell
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SUGARCUBE_URL%' -OutFile 'sugarcube.zip' -UseBasicParsing"
    if !errorlevel! neq 0 (
        echo Error: Failed to download SugarCube.
        exit /b 1
    )

    :: Extract SugarCube into storyformats directory
    echo Extracting SugarCube...
    if not exist "%SUGARCUBE_DIR%" mkdir "%SUGARCUBE_DIR%"
    powershell -Command "Expand-Archive -Path 'sugarcube.zip' -DestinationPath '%SUGARCUBE_DIR%' -Force"
    del sugarcube.zip

    echo SugarCube %SUGARCUBE_VERSION% installed successfully!
)

:: Configure git to use the repo's hooks
git config core.hooksPath .githooks
echo Git hooks configured.

echo Setup complete!
echo You can now run build.bat to build the story.
