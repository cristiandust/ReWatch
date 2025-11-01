const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const archiver = require('archiver');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const manifestPath = path.join(rootDir, 'manifest.json');

const runBuild = () => {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(command, ['run', 'build'], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const readManifestVersion = async () => {
  const content = await fs.promises.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(content);
  const version = parsed?.version;
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('manifest.json is missing a valid version field');
  }
  return version;
};

const ensureDirectory = async (directory) => {
  await fs.promises.mkdir(directory, { recursive: true });
};

const removeFileIfExists = async (filePath) => {
  try {
    await fs.promises.rm(filePath, { force: true });
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }
};

const createArchive = (sourceDir, destination) => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob('**/*', { cwd: sourceDir, ignore: ['*.zip'] });
    archive.finalize();
  });
};

const packageExtension = async () => {
  runBuild();
  await ensureDirectory(distDir);
  const version = await readManifestVersion();
  const zipPath = path.join(distDir, `rewatch-${version}.zip`);
  await removeFileIfExists(zipPath);
  await createArchive(distDir, zipPath);
  console.log(`Created package at ${zipPath}`);
};

packageExtension().catch((error) => {
  console.error('Failed to package extension', error);
  process.exit(1);
});
