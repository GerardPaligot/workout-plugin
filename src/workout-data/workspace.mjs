import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import * as defaultFilesystem from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAlias, isMap, isSeq, parseAllDocuments } from 'yaml';
import { RESOURCE_DEFINITIONS, ResourceRequestError } from './resources.mjs';

const TEMPLATE_DIRECTORY = [
  fileURLToPath(new URL('../../templates/', import.meta.url)),
  fileURLToPath(new URL('../templates/', import.meta.url)),
].find(existsSync);

function invalidTarget(message) {
  return new ResourceRequestError('invalid_target', message);
}

function invalidPayload(message) {
  return new ResourceRequestError('invalid_payload', message);
}

function existingAncestor(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error?.code === 'ENOTDIR') throw invalidTarget(`Target ancestor is not a directory: ${path}.`);
    throw error;
  }
}

function assertSafeAncestor(path) {
  const stats = existingAncestor(path);
  if (!stats) return;
  if (stats.isSymbolicLink()) throw invalidTarget(`Symlinked target ancestor is not allowed: ${path}.`);
  if (!stats.isDirectory()) throw invalidTarget(`Target ancestor is not a directory: ${path}.`);
}

function safeProgramName(program) {
  return typeof program === 'string'
    && program.length > 0
    && !isAbsolute(program)
    && basename(program) === program
    && !program.includes('\0')
    && !['.', '..', 'archives'].includes(program);
}

function templatePathFor(definition) {
  const templateName = definition.document === 'status.yaml' ? 'status.yaml' : definition.document;
  return TEMPLATE_DIRECTORY ? join(TEMPLATE_DIRECTORY, templateName) : undefined;
}

function defaultDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.valueOf() - offset).toISOString().slice(0, 10);
}

function payloadRoute(definition, key) {
  return definition.createRoutes?.[key] ?? [key];
}

export function resolveTarget(workspace, request) {
  let root;
  try {
    root = realpathSync(resolve(workspace));
    if (!statSync(root).isDirectory()) throw new Error('not a directory');
  } catch {
    throw invalidTarget('Workspace must be an existing directory.');
  }

  const definition = RESOURCE_DEFINITIONS[request?.resource];
  if (!definition) {
    throw invalidTarget('Unknown resource request.');
  }

  if (definition.target === 'workspace') {
    const path = join(root, definition.document);
    return { workspace: root, path, location: definition.document, templatePath: templatePathFor(definition) };
  }

  if (!safeProgramName(request.program)) {
    throw invalidTarget('--program must be a safe program directory name outside programs/archives.');
  }

  const programsPath = join(root, 'programs');
  const programDir = join(programsPath, request.program);
  assertSafeAncestor(programsPath);
  assertSafeAncestor(programDir);

  let path = join(programDir, definition.document);
  if (definition.target === 'mesocycle') {
    if (!Number.isSafeInteger(request.mesocycle) || request.mesocycle < 1) {
      throw invalidTarget('--mesocycle must be a positive integer.');
    }
    const mesocycleDir = join(programDir, `mesocycle-${request.mesocycle}`);
    assertSafeAncestor(mesocycleDir);
    path = join(mesocycleDir, definition.document);
  }

  const containment = relative(root, path);
  if (containment === '' || containment.startsWith('..') || isAbsolute(containment)) {
    throw invalidTarget('Resolved target is outside the workspace.');
  }
  return {
    workspace: root,
    path,
    location: containment,
    templatePath: templatePathFor(definition),
    programDir,
  };
}

function hasUnsupportedYaml(node) {
  if (!node) return false;
  if (isAlias(node)) return true;
  if (isMap(node)) {
    return node.items.some((pair) => pair.key?.toJSON?.() === '<<' || hasUnsupportedYaml(pair.key) || hasUnsupportedYaml(pair.value));
  }
  return isSeq(node) && node.items.some(hasUnsupportedYaml);
}

export function assertRoundTripSafe(documents) {
  if (documents.length !== 1 || documents[0].errors.length > 0 || hasUnsupportedYaml(documents[0].contents)) {
    throw new ResourceRequestError('unsupported_yaml', 'YAML cannot be round-tripped safely.');
  }
  return documents[0];
}

export function loadRoundTripDocument(path) {
  let documents;
  try {
    documents = parseAllDocuments(readFileSync(path, 'utf8'), { keepSourceTokens: true, prettyErrors: false, merge: false });
  } catch {
    throw new ResourceRequestError('unsupported_yaml', `YAML cannot be read safely: ${path}.`);
  }
  return assertRoundTripSafe(documents);
}

export function createFromTemplate(resource, payload, target, asOf = defaultDate()) {
  const definition = RESOURCE_DEFINITIONS[resource];
  if (!definition?.verbs.includes('create') || !definition.create) throw invalidTarget(`Creation is not supported for ${resource}.`);
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw invalidPayload('Payload must be a JSON object.');
  try {
    lstatSync(target.path);
    throw new ResourceRequestError('already_exists', `Target document already exists: ${target.location}.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const editable = new Set([...definition.create.required, ...definition.create.optional]);
  for (const key of Object.keys(payload)) {
    if (!editable.has(key)) throw invalidPayload(`Payload field is not editable during create: ${key}.`);
  }
  for (const key of definition.create.required) {
    if (!Object.hasOwn(payload, key)) throw invalidPayload(`Payload is missing required field: ${key}.`);
  }

  let document;
  try {
    document = loadRoundTripDocument(target.templatePath);
  } catch {
    throw invalidTarget(`Template is unavailable for ${resource}.`);
  }
  if (document.errors.length > 0) throw new ResourceRequestError('unsupported_yaml', `Template cannot be read safely for ${resource}.`);

  for (const key of editable) {
    const route = payloadRoute(definition, key);
    if (Object.hasOwn(payload, key)) document.setIn(route, payload[key]);
    else document.deleteIn(route);
  }

  document.setIn(['meta', 'schema_version'], 1);
  if (resource === 'program-status') {
    if (!target.programDir) throw invalidTarget('Program status requires a program target.');
    document.set('program', basename(target.programDir));
  }
  if (resource === 'sessions') {
    const match = /mesocycle-(\d+)$/.exec(dirname(target.path));
    if (!match) throw invalidTarget('Sessions require a mesocycle target.');
    document.setIn(['meta', 'mesocycle'], Number(match[1]));
  }
  if (resource === 'macrocycle' || resource === 'sessions') {
    document.setIn(['meta', 'version'], 1);
    document.setIn(['meta', 'last_modified'], asOf);
  }
  return document;
}

function conflict(message) {
  return new ResourceRequestError('conflict', message);
}

function removeEmptyDirectories(paths, filesystem) {
  for (const path of [...paths].reverse()) {
    try {
      filesystem.rmdirSync(path);
    } catch {
      // A concurrent writer may have populated the directory. It is no longer ours to remove.
    }
  }
}

function createTargetDirectory(directory, filesystem) {
  const missing = [];
  let current = directory;
  while (true) {
    try {
      const stats = filesystem.lstatSync(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw invalidTarget(`Target ancestor is not a directory: ${current}.`);
      }
      break;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      missing.push(current);
      const parent = dirname(current);
      if (parent === current) throw invalidTarget(`Target directory does not exist: ${directory}.`);
      current = parent;
    }
  }

  const created = [];
  try {
    for (const path of missing.reverse()) {
      try {
        filesystem.mkdirSync(path, { mode: 0o755 });
        created.push(path);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const stats = filesystem.lstatSync(path);
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw invalidTarget(`Target ancestor is not a directory: ${path}.`);
        }
      }
    }
    return created;
  } catch (error) {
    removeEmptyDirectories(created, filesystem);
    throw error;
  }
}

function isSameFile(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino;
}

function removeOwnedLock(lockPath, identity, token, tokenWritten, filesystem) {
  try {
    const current = filesystem.lstatSync(lockPath);
    if (!isSameFile(identity, current)) return;
    if (tokenWritten && filesystem.readFileSync(lockPath, 'utf8') !== token) return;
    filesystem.unlinkSync(lockPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function writeLockToken(descriptor, token, filesystem) {
  const bytes = Buffer.from(token, 'utf8');
  for (let offset = 0; offset < bytes.length;) {
    const written = filesystem.writeSync(descriptor, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(written) || written <= 0) throw new Error('Unable to write lock token.');
    offset += written;
  }
}

function temporaryPath(targetPath) {
  return join(dirname(targetPath), `.${basename(targetPath)}.workout-data-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
}

export async function withTargetLock(path, action, filesystem = defaultFilesystem) {
  const lockPath = `${path}.lock`;
  const createdDirectories = createTargetDirectory(dirname(path), filesystem);
  let descriptor;
  let identity;
  let tokenWritten = false;
  const token = `${process.pid} ${new Date().toISOString()} ${randomUUID()}\n`;
  try {
    descriptor = filesystem.openSync(lockPath, 'wx', 0o600);
    identity = filesystem.fstatSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        filesystem.closeSync(descriptor);
      } catch {
        // Preserve the identity-capture failure.
      }
      try {
        filesystem.unlinkSync(lockPath);
      } catch {
        // The lock was opened exclusively by this invocation; preserve the identity-capture failure.
      }
    }
    removeEmptyDirectories(createdDirectories, filesystem);
    if (error?.code === 'EEXIST') throw conflict(`A write lock already exists for ${basename(path)}.`);
    throw error;
  }

  try {
    writeLockToken(descriptor, token, filesystem);
    tokenWritten = true;
    return await action();
  } finally {
    try {
      filesystem.closeSync(descriptor);
    } finally {
      try {
        removeOwnedLock(lockPath, identity, token, tokenWritten, filesystem);
      } finally {
        removeEmptyDirectories(createdDirectories, filesystem);
      }
    }
  }
}

export function atomicReplace(targetPath, text, filesystem = defaultFilesystem) {
  const directory = dirname(targetPath);
  const createdDirectories = createTargetDirectory(directory, filesystem);
  const tempPath = temporaryPath(targetPath);
  let descriptor;
  let ownsTemporaryPath = false;
  let completed = false;

  try {
    let mode = 0o644;
    try {
      mode = filesystem.statSync(targetPath).mode & 0o777;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    descriptor = filesystem.openSync(tempPath, 'wx', mode);
    ownsTemporaryPath = true;
    filesystem.chmodSync(tempPath, mode);
    const bytes = Buffer.from(text, 'utf8');
    for (let offset = 0; offset < bytes.length;) {
      const written = filesystem.writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (!Number.isInteger(written) || written <= 0) throw new Error('Unable to write temporary file.');
      offset += written;
    }
    filesystem.fsyncSync(descriptor);
    filesystem.closeSync(descriptor);
    descriptor = undefined;
    filesystem.renameSync(tempPath, targetPath);
    completed = true;

    let directoryDescriptor;
    try {
      directoryDescriptor = filesystem.openSync(directory, 'r');
      filesystem.fsyncSync(directoryDescriptor);
    } catch {
      // The rename already made the new target visible. Directory sync is best effort.
    } finally {
      if (directoryDescriptor !== undefined) {
        try {
          filesystem.closeSync(directoryDescriptor);
        } catch {
          // The rename already made the new target visible. Directory close is best effort.
        }
      }
    }
  } finally {
    if (descriptor !== undefined) {
      try {
        filesystem.closeSync(descriptor);
      } catch {
        // Preserve the original write failure.
      }
    }
    if (!completed) {
      if (ownsTemporaryPath) {
        try {
          filesystem.unlinkSync(tempPath);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      removeEmptyDirectories(createdDirectories, filesystem);
    }
  }
}
