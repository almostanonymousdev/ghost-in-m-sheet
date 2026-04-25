@echo off
setlocal enabledelayedexpansion

:: Build script for Ghost in M'Sheet (Windows)
:: This script builds the Twee/Twine story into an HTML file

cd /d "%~dp0\.."

:: Configuration
set OUTPUT_FILE=dist\ghost-in-msheet.html
set PASSAGES_DIR=passages
set TWEEGO_EXE=tweego-2.1.1-windows-x64\tweego.exe
if not exist "dist" mkdir "dist"

echo Starting build process...

:: Check if Tweego exists locally
if not exist "%TWEEGO_EXE%" (
    echo Tweego not found at %TWEEGO_EXE%
    echo Attempting to use system-installed tweego...
    where tweego >nul 2>&1
    if !errorlevel! neq 0 (
        echo Error: Tweego not found. Please install Tweego or run setup.bat first.
        echo Download from: https://github.com/tmedwards/tweego
        exit /b 1
    )
    set TWEEGO_EXE=tweego
)

:: Check if passages directory exists
if not exist "%PASSAGES_DIR%" (
    echo Error: Passages directory '%PASSAGES_DIR%' not found
    exit /b 1
)

:: Check if there are any .tw files
dir /b "%PASSAGES_DIR%\*.tw" >nul 2>&1
if !errorlevel! neq 0 (
    echo Error: No .tw files found in '%PASSAGES_DIR%' directory
    exit /b 1
)

:: Run all passage checks before building
echo Checking passage links and duplicates...
python tools\check_links.py
if !errorlevel! neq 0 (
    echo Error: Passage link/duplicate check failed.
    exit /b 1
)
echo Link check passed.

echo Checking asset references...
python tools\check_assets.py
if !errorlevel! neq 0 (
    echo Error: Missing asset files detected.
    exit /b 1
)
echo Asset check passed.

echo Checking ghost data integrity...
python tools\check_ghosts.py
if !errorlevel! neq 0 (
    echo Error: Ghost data integrity check failed.
    exit /b 1
)
echo Ghost check passed.

:: Build the story
echo Building story from %PASSAGES_DIR% to %OUTPUT_FILE%...

"%TWEEGO_EXE%" -o "%OUTPUT_FILE%" "%PASSAGES_DIR%"
if !errorlevel! neq 0 (
    echo Error: Build failed
    exit /b 1
)

:: Check if output file was created
if not exist "%OUTPUT_FILE%" (
    echo Error: Build completed but output file was not created
    exit /b 1
)

for %%A in ("%OUTPUT_FILE%") do set FILE_SIZE=%%~zA
echo Build successful!
echo Output file created: %OUTPUT_FILE% (%FILE_SIZE% bytes)

echo Build process completed successfully!
