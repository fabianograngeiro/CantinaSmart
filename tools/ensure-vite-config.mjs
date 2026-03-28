import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targetPath = path.join(rootDir, 'vite.config.ts');
const examplePath = path.join(rootDir, 'vite.config.example.ts');

if (!fs.existsSync(targetPath)) {
  if (!fs.existsSync(examplePath)) {
    console.error('Missing vite.config.example.ts; cannot generate vite.config.ts');
    process.exit(1);
  }

  fs.copyFileSync(examplePath, targetPath);
  console.log('Created vite.config.ts from vite.config.example.ts');
}
