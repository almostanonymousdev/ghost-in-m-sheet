# Setup Guide for Ghost in M'Sheet

## Prerequisites

- Tweego (Twee/Twine compiler)
  - Download from: <https://github.com/tmedwards/tweego>
  - Or use the automated setup script below
- Python 3 (for validation checks during build)
- **Windows users:** PowerShell 5+ (included with Windows 10/11)

## Quick Setup

### Automated Setup (Recommended)

Run the setup script to automatically download and install Tweego and SugarCube:

**Linux / macOS:**

```bash
./setup.sh
```

**Windows:**

```cmd
setup.bat
```

This will:

1. Download the correct Tweego 2.1.1 build for your OS
2. Download SugarCube 2.37.3
3. Extract them to the appropriate directories
4. Configure git hooks

### Manual Setup

If you prefer to set up Tweego manually:

1. Download Tweego from: <https://github.com/tmedwards/tweego/releases>
   - Linux/macOS: `tweego-2.1.1-linux-x64.zip`
   - Windows: `tweego-2.1.1-windows-x64.zip`
2. Extract the archive to the project root
3. Ensure the path in the build script matches your Tweego location:
   - Linux/macOS default: `tweego-2.1.1-linux-x64/tweego`
   - Windows default: `tweego-2.1.1-windows-x64\tweego.exe`
   - Or update the `TWEEGO_PATH` variable in `build.sh` / `build.bat`

## Building and Opening the Project

### Using VS Code (Recommended)

1. Open the project in VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Run Task" and select "Tasks: Run Task"
4. Choose "Build Story" to build, or "Open in Browser" to build and open

VS Code tasks automatically detect your OS and run the correct script.

### Using Command Line

**Linux / macOS:**

```bash
# Build the story
./build.sh

# Build and open in browser
./start.sh
```

**Windows:**

```cmd
:: Build the story
build.bat

:: Build and open in browser
start.bat
```

The build produces `ghost-in-msheet.html`, which can be opened directly in any browser — no server required.

## VS Code Integration

### Keyboard Shortcuts

- `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac): Run Build Task
- `Ctrl+Shift+P` → "Run Task": Select from available tasks

### Debugging

1. Press `F5` to build and launch the story in Chrome or Firefox

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

The build process creates `ghost-in-msheet.html` in the project root directory. Open it directly in any web browser — no server needed.

## Customization

You can customize the build process by editing:

- `build.sh` / `build.bat`: Main build script (Linux+macOS / Windows)
- `start.sh` / `start.bat`: Build and open script
- `setup.sh` / `setup.bat`: One-time setup script
- `.vscode/tasks.json`: VS Code task definitions (auto-detects OS)
- `.vscode/launch.json`: VS Code debug configurations
