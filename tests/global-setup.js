const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const projectRoot = path.join(__dirname, '..');
  const isWin = process.platform === 'win32';
  execSync(isWin ? 'build.bat' : './build.sh', {
    cwd: projectRoot,
    stdio: 'inherit',
  });
};
