import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// src/ and scripts/ both sit one level below the plugin root.
export const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadYaml(filePath) {
  return yaml.load(readFileSync(filePath, 'utf8'), { schema: yaml.JSON_SCHEMA });
}
