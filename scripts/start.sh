#!/bin/bash

# Start script for Ghost in M'Sheet
# This script builds the story and opens it in the default browser

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

OUTPUT_FILE="ghost-in-msheet.html"
STORY_INIT="passages/StoryInit.tw"
STORY_SCRIPT="passages/StoryScript.js"

# Parse arguments
DEBUG_MODE=false
IMAGE_PATH_OVERRIDE=""
for arg in "$@"; do
    if [ "$arg" = "debug" ]; then
        DEBUG_MODE=true
    elif [ -z "$IMAGE_PATH_OVERRIDE" ]; then
        IMAGE_PATH_OVERRIDE="$arg"
    fi
done

# Collect files to restore on exit
RESTORE_FILES=()

if [ -n "$IMAGE_PATH_OVERRIDE" ]; then
    if [ ! -f "$STORY_INIT" ]; then
        echo -e "${RED}Error: $STORY_INIT not found; cannot override ImagePath.${NC}"
        exit 1
    fi
    cp "$STORY_INIT" "$STORY_INIT.bak"
    RESTORE_FILES+=("$STORY_INIT")
    sed -i "s|setup.ImagePath = \"[^\"]*\"|setup.ImagePath = \"$IMAGE_PATH_OVERRIDE\"|" "$STORY_INIT"
    echo -e "${YELLOW}Using ImagePath override: $IMAGE_PATH_OVERRIDE${NC}"
fi

# Enable SugarCube debug mode by injecting Config.debug into StoryScript before building
if [ "$DEBUG_MODE" = true ]; then
    cp "$STORY_SCRIPT" "$STORY_SCRIPT.bak"
    RESTORE_FILES+=("$STORY_SCRIPT")
    sed -i '1i Config.debug = true;\n$(document).one(":storyready", function() { document.documentElement.removeAttribute("data-debug-view"); });' "$STORY_SCRIPT"
    echo -e "${YELLOW}SugarCube debug mode enabled${NC}"
fi

# Restore modified files on exit
cleanup() {
    for f in "${RESTORE_FILES[@]}"; do
        mv "$f.bak" "$f"
    done
}
trap cleanup EXIT

# Build the story
echo -e "${YELLOW}Building story...${NC}"
if ! "$SCRIPT_DIR/build.sh"; then
    echo -e "${RED}Error: Build failed.${NC}"
    exit 1
fi

# Open the file in the default browser
echo -e "${GREEN}Opening $OUTPUT_FILE in browser...${NC}"
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$REPO_ROOT/$OUTPUT_FILE"
elif command -v open >/dev/null 2>&1; then
    open "$REPO_ROOT/$OUTPUT_FILE"
else
    echo -e "${YELLOW}Could not detect a browser opener. Open this file manually:${NC}"
    echo -e "${YELLOW}  $REPO_ROOT/$OUTPUT_FILE${NC}"
fi
