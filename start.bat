@echo off
setlocal enabledelayedexpansion

:: Start script for Ghost in M'Sheet (Windows)
:: This script builds the story and opens it in the default browser

cd /d "%~dp0"

set OUTPUT_FILE=ghost-in-msheet.html
set STORY_INIT=passages\StoryInit.tw
set STORY_SCRIPT=passages\StoryScript.tw

:: Parse arguments
set DEBUG_MODE=false
set IMAGE_PATH_OVERRIDE=
for %%a in (%*) do (
    if "%%a"=="debug" (
        set DEBUG_MODE=true
    ) else (
        if "!IMAGE_PATH_OVERRIDE!"=="" set IMAGE_PATH_OVERRIDE=%%a
    )
)

:: Handle image path override
if not "!IMAGE_PATH_OVERRIDE!"=="" (
    if not exist "%STORY_INIT%" (
        echo Error: %STORY_INIT% not found; cannot override ImagePath.
        exit /b 1
    )
    copy "%STORY_INIT%" "%STORY_INIT%.bak" >nul
    powershell -Command "(Get-Content '%STORY_INIT%') -replace 'setup\.ImagePath = \"[^\"]*\"', 'setup.ImagePath = \"!IMAGE_PATH_OVERRIDE!\"' | Set-Content '%STORY_INIT%'"
    echo Using ImagePath override: !IMAGE_PATH_OVERRIDE!
)

:: Enable SugarCube debug mode
if "%DEBUG_MODE%"=="true" (
    copy "%STORY_SCRIPT%" "%STORY_SCRIPT%.bak" >nul
    powershell -Command "$content = Get-Content '%STORY_SCRIPT%' -Raw; $inject = \"`nConfig.debug = true;`n`$(document).one(':storyready', function() { document.documentElement.removeAttribute('data-debug-view'); });`n\"; $lines = $content -split '`n'; $lines[0] + \"`n\" + $inject + ($lines[1..($lines.Length-1)] -join \"`n\") | Set-Content '%STORY_SCRIPT%' -NoNewline"
    echo SugarCube debug mode enabled
)

:: Build the story
echo Building story...
call build.bat
if !errorlevel! neq 0 (
    echo Error: Build failed.
    goto :cleanup
)

:: Open the file in the default browser
echo Opening %OUTPUT_FILE% in browser...
start "" "%~dp0%OUTPUT_FILE%"

:cleanup
:: Restore modified files
if exist "%STORY_INIT%.bak" (
    move /y "%STORY_INIT%.bak" "%STORY_INIT%" >nul
)
if exist "%STORY_SCRIPT%.bak" (
    move /y "%STORY_SCRIPT%.bak" "%STORY_SCRIPT%" >nul
)
