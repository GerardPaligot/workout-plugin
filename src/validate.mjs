import { readFileSync, readdirSync, statSync, lstatSync, existsSync } from 'node:fs';
import { join, basename, dirname, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadYaml, PLUGIN_ROOT } from './common.mjs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const SCHEMA_BY_FILENAME = {
  'status.yaml': 'status.schema.json',
  'goals.yaml': 'goals.schema.json',
  'macrocycle.yaml': 'macrocycle.schema.json',
  'sessions.yaml': 'sessions.schema.json',
  'exercises.yaml': 'exercises.schema.json',
  'exercises.custom.yaml': 'exercises.schema.json',
  'profile.yaml': 'profile.schema.json',
};

export { loadYaml };

export const CATALOG_PATH = join(PLUGIN_ROOT, 'catalog', 'exercises.yaml');
export const CUSTOM_CATALOG = 'exercises.custom.yaml';

// Plugin catalog + optional workspace `exercises.custom.yaml`, merged into one catalog doc.
// A custom slug that already exists in the plugin catalog replaces it; a custom equipment id that
// already exists is ignored. Both give a warning.
export function loadCatalog(workspace, catalogPath = CATALOG_PATH) {
  const base = loadYaml(catalogPath);
  const doc = { path: catalogPath, fileName: 'exercises.yaml', origin: new Map(),
    data: { meta: base.meta, equipment: [...(base.equipment || [])], exercises: [...(base.exercises || [])] } };
  const errors = [];
  const warnings = [];
  const customPath = join(workspace, CUSTOM_CATALOG);
  if (!existsSync(customPath)) return { doc, errors, warnings };
  let custom;
  try { custom = loadYaml(customPath); } catch (e) {
    return { doc, errors: [`${CUSTOM_CATALOG}: YAML parse error — ${e.message}`], warnings };
  }
  const equip = new Set(doc.data.equipment);
  const seenEquip = new Set();
  const seenSlugs = new Set();
  for (const id of custom?.equipment || []) {
    if (seenEquip.has(id)) { errors.push(`${CUSTOM_CATALOG}: equipment "${id}" is defined twice in ${CUSTOM_CATALOG}`); continue; }
    seenEquip.add(id);
    if (equip.has(id)) warnings.push(`${CUSTOM_CATALOG}: equipment "${id}" already exists in the plugin catalog — ignored`);
    else { equip.add(id); doc.data.equipment.push(id); }
  }
  for (const ex of custom?.exercises || []) {
    if (seenSlugs.has(ex.slug)) { errors.push(`${CUSTOM_CATALOG}: exercise slug "${ex.slug}" is defined twice in ${CUSTOM_CATALOG}`); continue; }
    seenSlugs.add(ex.slug);
    const i = doc.data.exercises.findIndex((e) => e.slug === ex.slug);
    if (i >= 0) {
      warnings.push(`${CUSTOM_CATALOG}: exercise "${ex.slug}" overrides the plugin catalog entry`);
      doc.data.exercises[i] = ex;
    } else doc.data.exercises.push(ex);
    doc.origin.set(ex.slug, CUSTOM_CATALOG);
  }
  return { doc, errors, warnings };
}

export function buildValidators(schemasDir = join(PLUGIN_ROOT, 'schemas')) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validators = {};
  const bySchema = {};
  for (const [yamlName, schemaFile] of Object.entries(SCHEMA_BY_FILENAME)) {
    const schemaPath = join(schemasDir, schemaFile);
    if (!existsSync(schemaPath)) continue;
    bySchema[schemaFile] ??= ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')));
    validators[yamlName] = bySchema[schemaFile];
  }
  return validators;
}

export function collectYamlFiles(rootDir) {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'schemas' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) out.push(full);
    }
  })(rootDir);
  return out;
}

function collectYamlFilesWithoutSymlinks(rootDir) {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'schemas' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(full);
      else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) out.push(full);
    }
  })(rootDir);
  return out;
}

export function validateDoc(validators, fileName, doc) {
  const validate = validators[fileName];
  if (!validate) return [];
  if (validate(doc)) return [];
  return validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
}

export function crossValidate(docs, root, catalogDoc) {
  const errors = [];
  const catalog = catalogDoc ?? docs.find((d) => d.fileName === 'exercises.yaml');
  const slugs = new Set(catalog ? (catalog.data.exercises || []).map((e) => e.slug) : []);
  const equipment = new Set(catalog ? catalog.data.equipment || [] : []);

  // Rule 3: exercise equipment ∈ equipment list
  if (catalog) {
    for (const ex of catalog.data.exercises || []) {
      for (const id of [].concat(ex.equipment ?? [])) {
        if (!equipment.has(id)) {
          errors.push(`${catalog.origin?.get(ex.slug) ?? 'exercises.yaml'}: unknown equipment "${id}" (exercise ${ex.slug})`);
        }
      }
    }
  }

  for (const d of docs) {
    const loc = root ? relative(root, d.path) : d.path;
    // Rule 1: session exercise slugs ∈ catalog
    if (d.fileName === 'sessions.yaml') {
      for (const s of d.data.sessions || []) {
        for (const ex of s.exercises || []) {
          if (!slugs.has(ex.exercise)) {
            errors.push(`${loc}: unknown exercise "${ex.exercise}" (session ${s.id})`);
          }
        }
      }
    }
    // Rule 2: reference load exercise slugs ∈ catalog
    if (d.fileName === 'goals.yaml') {
      for (const c of d.data.reference_loads || []) {
        if (!slugs.has(c.exercise)) {
          errors.push(`${loc}: reference_load unknown exercise "${c.exercise}"`);
        }
      }
    }
    // Rule 5: profile equipment ids ∈ catalog equipment list
    if (d.fileName === 'profile.yaml' && catalog) {
      for (const e of d.data.equipment || []) {
        if (!equipment.has(e.id)) {
          errors.push(`${loc}: unknown equipment "${e.id}" (not in the catalog equipment list)`);
        }
      }
    }
    // Rule 4: review refs point to an existing file
    const revisions = d.data?.meta?.revisions;
    if (Array.isArray(revisions)) {
      for (const r of revisions) {
        const target = resolve(dirname(d.path), r.ref);
        if (!existsSync(target)) {
          errors.push(`${loc}: review not found "${r.ref}"`);
        }
      }
    }
    // Rule 6: scheduling mode (macrocycle) vs `days` (sessions) and `next_session_id` (status)
    if (d.fileName === 'sessions.yaml' || d.fileName === 'status.yaml') {
      const programDir = d.fileName === 'sessions.yaml' ? dirname(dirname(d.path)) : dirname(d.path);
      const macro = docs.find((m) => m.fileName === 'macrocycle.yaml' && dirname(m.path) === programDir);
      const rotation = (macro?.data?.scheduling ?? 'weekdays') === 'rotation';
      if (d.fileName === 'sessions.yaml') {
        const seen = new Set();
        for (const s of d.data.sessions || []) {
          if (rotation) {
            if (s.days !== undefined) errors.push(`${loc}: session ${s.id} must not set "days" (program uses rotation scheduling)`);
            if (s.id != null) {
              if (seen.has(s.id)) errors.push(`${loc}: duplicate session id "${s.id}" (rotation needs distinct sessions)`);
              seen.add(s.id);
            }
          } else if (s.days === undefined) {
            errors.push(`${loc}: session ${s.id} has no "days" (program is scheduled by weekdays)`);
          }
        }
      } else if (d.data?.next_session_id != null) {
        const id = d.data.next_session_id;
        if (!rotation) {
          errors.push(`${loc}: next_session_id "${id}" is only valid when the macrocycle sets scheduling: rotation`);
        } else {
          const n = d.data.current_mesocycle;
          const target = join(programDir, `mesocycle-${n}`, 'sessions.yaml');
          const sess = docs.find((m) => m.fileName === 'sessions.yaml' && m.path === target);
          if (sess && !(sess.data.sessions || []).some((s) => s.id === id)) {
            errors.push(`${loc}: next_session_id "${id}" not found in mesocycle-${n}/sessions.yaml`);
          }
        }
      }
    }
  }
  return errors;
}

function loadWorkspaceDocument(path, root, validators, errors, docs, replacement) {
  const fileName = basename(path);
  const location = relative(root, path);
  let data;
  if (replacement && resolve(replacement.path) === resolve(path)) {
    data = replacement.data;
  } else {
    try {
      data = loadYaml(path);
    } catch (error) {
      errors.push(`${location}: YAML parse error — ${error.message}`);
      return;
    }
  }
  for (const error of validateDoc(validators, fileName, data)) {
    errors.push(`${location}: ${error}`);
  }
  if (SCHEMA_BY_FILENAME[fileName]) docs.push({ path, fileName, data });
}

function validateCustomCatalog(root, validators, errors) {
  const path = join(root, CUSTOM_CATALOG);
  if (!existsSync(path)) return 0;
  try {
    const data = loadYaml(path);
    for (const error of validateDoc(validators, CUSTOM_CATALOG, data)) {
      errors.push(`${CUSTOM_CATALOG}: ${error}`);
    }
    return 1;
  } catch {
    // loadCatalog reports the parse failure with its established message.
    return 1;
  }
}

function validateDocuments(root, paths, replacement, { includeCustomCatalog = false, legacyWarnings = false } = {}) {
  const validators = buildValidators();
  const docs = [];
  const errors = [];
  const warnings = [];

  let catalog;
  try {
    const loaded = loadCatalog(root);
    catalog = loaded.doc;
    errors.push(...loaded.errors);
    warnings.push(...loaded.warnings);
    for (const error of validateDoc(validators, 'exercises.yaml', loadYaml(CATALOG_PATH))) {
      errors.push(`catalog/exercises.yaml: ${error}`);
    }
  } catch (e) {
    errors.push(`plugin catalog unreadable (${CATALOG_PATH}): ${e.message}`);
  }

  for (const path of paths) {
    const fileName = basename(path);
    const location = relative(root, path);
    if (location === 'exercises.yaml') {
      if (legacyWarnings) {
        warnings.push(`${location}: legacy file ignored — the catalog now ships with the plugin; put your own entries in ${CUSTOM_CATALOG}`);
      }
      continue;
    }
    if (fileName === CUSTOM_CATALOG && includeCustomCatalog) continue;
    loadWorkspaceDocument(path, root, validators, errors, docs, replacement);
  }

  const customDocumentCount = includeCustomCatalog ? validateCustomCatalog(root, validators, errors) : 0;
  // Custom catalog is merged into `catalog`; keep it out of the per-file cross checks.
  const crossDocs = docs.filter((d) => d.fileName !== CUSTOM_CATALOG);
  errors.push(...crossValidate(crossDocs, root, catalog));
  return { errors, warnings, documentCount: docs.length + customDocumentCount };
}

function isWithin(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function validateWorkspace(root) {
  return validateDocuments(root, collectYamlFiles(root), undefined, {
    includeCustomCatalog: true,
    legacyWarnings: true,
  });
}

export function validateProgramClosure(root, programId, replacement) {
  if (programId === 'archives') throw new TypeError('programId "archives" is reserved');
  const paths = [];
  const profilePath = join(root, 'profile.yaml');
  if (existsSync(profilePath)) paths.push(profilePath);
  const programDir = join(root, 'programs', programId);
  if (existsSync(programDir)) {
    for (const path of collectYamlFilesWithoutSymlinks(programDir)) {
      if (SCHEMA_BY_FILENAME[basename(path)]) paths.push(path);
    }
  }
  if (replacement) {
    const replacementPath = resolve(replacement.path);
    if (isWithin(programDir, replacementPath) && SCHEMA_BY_FILENAME[basename(replacementPath)]
      && !paths.some((path) => resolve(path) === replacementPath)) {
      paths.push(replacementPath);
    }
  }
  return validateDocuments(root, paths, replacement, { includeCustomCatalog: true });
}

export function validateProfileClosure(root, replacement) {
  const profilePath = join(root, 'profile.yaml');
  const paths = existsSync(profilePath) ? [profilePath] : [];
  if (replacement && resolve(replacement.path) === resolve(profilePath) && !paths.length) paths.push(profilePath);
  return validateDocuments(root, paths, replacement, {
    includeCustomCatalog: true,
  });
}

export function main(root) {
  const result = validateWorkspace(root);
  for (const warning of result.warnings) console.error(`! ${warning}`);
  for (const error of result.errors) console.error(`✗ ${error}`);
  if (result.errors.length === 0) {
    console.log(`✓ ${result.documentCount} valid file(s)`);
    return 0;
  }
  console.error(`\n${result.errors.length} error(s)`);
  return 1;
}

if (process.argv[1] && basename(process.argv[1]) === 'validate.mjs'
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(resolve(process.argv[2] || '.')));
}
