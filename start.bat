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
if "!IMAGE_PATH_OVERRIDE!"=="" goto :skip_image
if not exist "%STORY_INIT%" (
    echo Error: %STORY_INIT% not found; cannot override ImagePath.
    exit /b 1
)
copy "%STORY_INIT%" "%STORY_INIT%.bak" >nul
> "%TEMP%\_gims_image.ps1" echo param($f,$p)
>> "%TEMP%\_gims_image.ps1" echo (Get-Content $f) -replace 'setup\.ImagePath = \"[^\"]*\"', ('setup.ImagePath = \"' + $p + '\"') ^| Set-Content $f
powershell -ExecutionPolicy Bypass -File "%TEMP%\_gims_image.ps1" "%STORY_INIT%" "!IMAGE_PATH_OVERRIDE!"
del "%TEMP%\_gims_image.ps1"
echo Using ImagePath override: !IMAGE_PATH_OVERRIDE!
:skip_image

:: Enable SugarCube debug mode
if not "%DEBUG_MODE%"=="true" goto :skip_debug
copy "%STORY_SCRIPT%" "%STORY_SCRIPT%.bak" >nul
> "%TEMP%\_gims_debug.ps1" echo param($f)
>> "%TEMP%\_gims_debug.ps1" echo $c = Get-Content $f -Raw
>> "%TEMP%\_gims_debug.ps1" echo $d = "Config.debug = true;" + [char]10 + "`$(document).one(':storyready', function() { document.documentElement.removeAttribute('data-debug-view'); });"
>> "%TEMP%\_gims_debug.ps1" echo $i = $c.IndexOf([char]10)
>> "%TEMP%\_gims_debug.ps1" echo if ($i -ge 0) { $c.Substring(0,$i+1) + $d + [char]10 + $c.Substring($i+1) } else { $c + [char]10 + $d } ^| Set-Content $f -NoNewline
powershell -ExecutionPolicy Bypass -File "%TEMP%\_gims_debug.ps1" "%STORY_SCRIPT%"
del "%TEMP%\_gims_debug.ps1"
echo SugarCube debug mode enabled
:skip_debug

:: Build the story
echo Building story...
call .\build.bat
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
