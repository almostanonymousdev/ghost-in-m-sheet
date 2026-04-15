@echo off
setlocal enabledelayedexpansion

:: Setup script for Ghost in M'Sheet (Windows)
:: This script downloads and sets up Tweego and SugarCube if needed

cd /d "%~dp0"

:: Configuration
set TWEEGO_VERSION=2.1.1
set TWEEGO_DIR=tweego-%TWEEGO_VERSION%-windows-x64
set TWEEGO_URL=https://github.com/tmedwards/tweego/releases/download/v%TWEEGO_VERSION%/tweego-%TWEEGO_VERSION%-windows-x64.zip
set TWEEGO_PATH=%~dp0%TWEEGO_DIR%\tweego.exe

set SUGARCUBE_VERSION=2.37.3
set SUGARCUBE_URL=https://github.com/tmedwards/sugarcube-2/releases/download/v%SUGARCUBE_VERSION%/sugarcube-%SUGARCUBE_VERSION%-for-twine-2.1-local.zip
set SUGARCUBE_PATH=%~dp0%TWEEGO_DIR%\storyformats
set SUGARCUBE_INSTALLED_PATH=%SUGARCUBE_PATH%\sugarcube-2

echo Setting up Ghost in M'Sheet...

:: Check if Tweego already exists
if exist "%TWEEGO_PATH%" (
    echo Tweego already installed at %TWEEGO_PATH%
    echo Skipping download...
) else (
    echo Tweego not found. Downloading...

    :: Download Tweego using PowerShell
    powershell -Command "Invoke-WebRequest -Uri '%TWEEGO_URL%' -OutFile 'tweego.zip'"
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

:: Check if SugarCube already exists
if exist "%SUGARCUBE_INSTALLED_PATH%" (
    echo SugarCube already installed at %SUGARCUBE_INSTALLED_PATH%
    echo Skipping download...
) else (
    echo SugarCube not found. Downloading...

    :: Download SugarCube using PowerShell
    powershell -Command "Invoke-WebRequest -Uri '%SUGARCUBE_URL%' -OutFile 'sugarcube.zip'"
    if !errorlevel! neq 0 (
        echo Error: Failed to download SugarCube.
        exit /b 1
    )

    :: Extract SugarCube
    echo Extracting SugarCube...
    powershell -Command "Expand-Archive -Path 'sugarcube.zip' -DestinationPath '%SUGARCUBE_PATH%' -Force"
    del sugarcube.zip

    echo SugarCube %SUGARCUBE_VERSION% installed successfully!
)

:: Configure git to use the repo's hooks
git config core.hooksPath .githooks
echo Git hooks configured.

echo Setup complete!
echo You can now run build.bat to build the story.
