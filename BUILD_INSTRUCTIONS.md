# Build Instructions for Ghost in M'Sheet

## Prerequisites

- Tweego (Twee/Twine compiler)
  - Download from: <https://github.com/tmedwards/tweego>
  - Or run `setup.sh` (Linux/macOS) / `setup.bat` (Windows) to install automatically
  - Or install system-wide and ensure `tweego` is in your PATH
- Python 3 (for validation checks during build)
- **Windows users:** PowerShell 5+ (included with Windows 10/11)

## Quick Start

### Using VS Code Tasks (Recommended)

1. Open the project in VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Run Task" and select "Tasks: Run Task"
4. Choose "Build Story" to build the project
5. Choose "Open in Browser" to build the story and open it in your default browser

VS Code tasks automatically detect your OS and run the correct script.

### Using Command Line

**Linux / macOS:**

```bash
# Build the story
./build.sh

# Build and open the story in your default browser
./start.sh

# Clean build artifacts
rm -f ghost-in-msheet.html
```

**Windows:**

```cmd
:: Build the story
build.bat

:: Build and open the story in your default browser
start.bat

:: Clean build artifacts
del ghost-in-msheet.html
```

## VS Code Integration

### Keyboard Shortcuts

- `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac): Run Build Task
- `Ctrl+Shift+P` → "Run Task": Select from available tasks

### Debugging

1. Build the story using the "Build Story" task (or run `./start.sh` to build and open it)
2. Press `F5` to launch the debugger
3. Choose your preferred browser (Chrome or Firefox)

## Build Script Features

The `build.sh` script includes:

- Automatic error handling
- Verification of required files and dependencies
- Color-coded output for better visibility
- File size reporting
- Cleanup of existing output files
- Detailed error messages

## Development Workflow

### With File Watching

If you have `inotify-tools` installed:

```bash
npm run watch
```

This will automatically rebuild the story whenever source files change.

### With npm (Cross-Platform)

npm scripts automatically detect your OS and run the correct build script:

```bash
# Install dependencies
npm install

# One-time setup (downloads Tweego & SugarCube)
npm run setup

# Build
npm run build

# Build and open in browser
npm start

# Watch for changes (Linux only, requires inotify-tools)
npm run watch

# Clean build artifacts
npm run clean

# Rebuild
npm run rebuild
```

## Troubleshooting

### Tweego not found

- Ensure Tweego is installed and in your PATH
- Or update the `TWEEGO_PATH` variable in `build.sh`

### No .tw files found

- Verify that your story passages are in the `passages/` directory
- Ensure files have the `.tw` extension

### Build fails

- Check that all required files exist
- Verify file permissions (build.sh should be executable)
- Check the error output for specific issues

## Output

The build process creates `ghost-in-msheet.html` in the project root directory, which can be:

- Opened directly in a web browser
- Served using a local development server
- Deployed to a web server

## Customization

You can customize the build process by editing:

- `build.sh` / `build.bat`: Main build script (Linux+macOS / Windows)
- `start.sh` / `start.bat`: Build-and-open-in-browser script
- `setup.sh` / `setup.bat`: One-time setup script
- `.vscode/tasks.json`: VS Code task definitions (auto-detects OS)
- `.vscode/launch.json`: VS Code debug configurations
