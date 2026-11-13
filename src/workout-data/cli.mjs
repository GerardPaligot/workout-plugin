import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { applyResourceOperation, readResource, RESOURCE_DEFINITIONS, ResourceRequestError, resolveResourceRequest } from './resources.mjs';
import { atomicReplace, createFromTemplate, loadRoundTripDocument, resolveTarget, withTargetLock } from './workspace.mjs';
import { validateProfileClosure, validateProgramClosure, validateWorkspace } from '../validate.mjs';

const VALUE_OPTIONS = new Set(['workspace', 'data', 'data-file', 'program', 'mesocycle', 'id', 'order', 'as-of', 'format', 'fields', 'before', 'after', 'scope']);
const FLAG_OPTIONS = new Set(['help', 'quiet']);
const WRITE_OPERATIONS = new Set(['create', 'add', 'update', 'remove', 'move']);
const HELP = 'Usage: workout-data [--workspace <path>] <verb> <resource> [options]';

function emit(io, destination, value) {
  io[destination].write(`${JSON.stringify(value)}\n`);
}

export function emitError(io, code, message, paths) {
  const value = { ok: false, code, message };
  if (paths?.length) value.paths = paths;
  emit(io, 'stderr', value);
}

function parseArguments(argv) {
  const options = {};
  const positionals = [];
  const unknownOptions = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    if (FLAG_OPTIONS.has(name)) {
      if (options[name] !== undefined) throw new ResourceRequestError('invalid_payload', `--${name} may only be supplied once.`);
      options[name] = true;
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) {
      unknownOptions.push(token);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new ResourceRequestError('invalid_payload', `--${name} requires a value.`);
    if (options[name] !== undefined) throw new ResourceRequestError('invalid_payload', `--${name} may only be supplied once.`);
    options[name] = value;
    index += 1;
  }
  if (unknownOptions.length > 0) {
    const code = positionals[0] === 'help' ? 'invalid_target' : 'invalid_payload';
    throw new ResourceRequestError(code, `Unknown option: ${unknownOptions[0]}.`);
  }
  return { positionals, options };
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function parsePayload(options, cwd, operation) {
  const sources = ['data', 'data-file'].filter((name) => options[name] !== undefined);
  if (WRITE_OPERATIONS.has(operation) && sources.length !== 1) {
    throw new ResourceRequestError('invalid_payload', 'Writes require exactly one of --data or --data-file.');
  }
  if (!WRITE_OPERATIONS.has(operation) && sources.length !== 0) {
    throw new ResourceRequestError('invalid_payload', '--data and --data-file are only valid for create, add, and update.');
  }
  if (sources.length === 0) return undefined;
  let json;
  try {
    json = options.data ?? readFileSync(resolve(cwd, options['data-file']), 'utf8');
  } catch {
    throw new ResourceRequestError('invalid_payload', 'Unable to read --data-file as UTF-8.');
  }
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new ResourceRequestError('invalid_payload', 'Payload must contain valid JSON.');
  }
  if (payload === null || Array.isArray(payload) || typeof payload !== 'object') {
    throw new ResourceRequestError('invalid_payload', 'Payload must be a JSON object.');
  }
  return payload;
}

function validateCommonOptions(options) {
  if (options.format !== undefined && !['json', 'text'].includes(options.format)) {
    throw new ResourceRequestError('invalid_payload', '--format must be json or text.');
  }
  if (options['as-of'] !== undefined && !isDate(options['as-of'])) {
    throw new ResourceRequestError('invalid_payload', '--as-of must be a valid YYYY-MM-DD date.');
  }
}

function projectItems(items, fields) {
  if (fields === undefined) return items;
  const names = fields.split(',');
  if (names.length === 0 || names.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) {
    throw new ResourceRequestError('invalid_payload', '--fields must be a comma-separated field list.');
  }
  if (items.some((item) => item === null || typeof item !== 'object' || Array.isArray(item))) {
    throw new ResourceRequestError('invalid_payload', '--fields can only project mapping items.');
  }
  return items.map((item) => Object.fromEntries(names.filter((name) => Object.hasOwn(item, name)).map((name) => [name, item[name]])));
}

function emitText(io, value) {
  io.stdout.write(`${value}\n`);
}

function targetSyntax(definition) {
  return definition.target === 'workspace'
    ? 'workspace'
    : definition.target === 'program'
      ? '--program <id>'
      : '--program <id> --mesocycle <n>';
}

function selectorGuide(definition) {
  if (definition.owner) {
    const selector = { type: 'owner', option: '--id', owner: definition.owner.resource, key: definition.owner.selectorKey };
    if (definition.itemSelectorKey) {
      selector.item = {
        option: '--order',
        key: definition.itemSelectorKey,
        label: definition.itemSelectorLabel ?? definition.itemSelectorKey,
        requiredFor: definition.verbs.filter((verb) => !['list', 'add'].includes(verb)),
      };
    }
    return selector;
  }
  if (definition.selector === 'id') return { type: 'identifier', option: '--id', key: definition.selectorKey };
  return { type: definition.selector };
}

function payloadGuide(definition) {
  const result = {};
  for (const operation of ['create', 'add']) {
    if (definition[operation]) result[operation] = definition[operation];
  }
  if (definition.update) result.update = { allowed: definition.update };
  if (definition.verbs.includes('remove')) result.remove = { required: [] };
  if (definition.verbs.includes('move')) result.move = { required: [], placement: ['--before <id>', '--after <id>'] };
  return result;
}

function helpResource(resource, definition) {
  return {
    resource,
    document: definition.document,
    target: targetSyntax(definition),
    selector: selectorGuide(definition),
    verbs: definition.verbs,
    payloads: payloadGuide(definition),
  };
}

function helpText(resource) {
  const selector = resource.selector.type === 'owner'
    ? ' --id <session>'
    : resource.selector.type === 'identifier' ? ` ${resource.selector.option} <${resource.selector.key}>` : '';
  const itemSelector = resource.selector.item
    ? ` ${resource.selector.item.option} <${resource.selector.item.label}> (${resource.selector.item.requiredFor.join(', ')})`
    : '';
  const lines = [
    resource.resource,
    `document: ${resource.document}`,
    `target: ${resource.target}${selector}${itemSelector}`,
    `verbs: ${resource.verbs.join(', ')}`,
  ];
  for (const [operation, payload] of Object.entries(resource.payloads)) {
    if (payload.required) lines.push(`${operation}: required ${payload.required.join(', ')}${payload.optional?.length ? `; optional ${payload.optional.join(', ')}` : ''}`);
    else if (payload.allowed) lines.push(`${operation}: allowed ${payload.allowed.join(', ')}`);
    else if (payload.placement) lines.push(`${operation}: ${payload.placement.join(' or ')}`);
  }
  return lines.join('\n');
}

function overviewSelector(selector) {
  if (selector.type === 'owner') {
    const itemSelector = selector.item ? ` ${selector.item.option} <${selector.item.label}> (${selector.item.requiredFor.join(', ')})` : '';
    return `--id <session>${itemSelector}`;
  }
  if (selector.type === 'identifier') return `${selector.option} <${selector.key}>`;
  return selector.type;
}

function emitHelp(io, resourceName, format) {
  if (resourceName === undefined) {
    const resources = Object.entries(RESOURCE_DEFINITIONS).map(([name, definition]) => {
      const resource = helpResource(name, definition);
      return { resource: resource.resource, target: resource.target, selector: resource.selector, verbs: resource.verbs };
    });
    if (format === 'text') {
      emitText(io, `${HELP}\n${resources.map((resource) => `${resource.resource}: ${resource.target}; selector ${overviewSelector(resource.selector)}; verbs ${resource.verbs.join(', ')}`).join('\n')}`);
    }
    else emit(io, 'stdout', { ok: true, operation: 'help', resources });
    return;
  }
  const definition = RESOURCE_DEFINITIONS[resourceName];
  if (!definition) throw new ResourceRequestError('invalid_target', `Unknown resource: ${resourceName}.`);
  const resource = helpResource(resourceName, definition);
  if (format === 'text') emitText(io, helpText(resource));
  else emit(io, 'stdout', { ok: true, operation: 'help', ...resource });
}

function emitRead(io, request, target, result, fields, format) {
  const value = {
    ok: true,
    resource: request.resource,
    location: target.location,
    selector: result.selector,
  };
  if (request.operation === 'list') value.items = projectItems(result.items, fields);
  else value.data = result.data;
  if (format === 'text') {
    const body = request.operation === 'list' ? projectItems(result.items, fields) : result.data;
    emitText(io, `${request.resource} (${target.location})\n${JSON.stringify(body, null, 2)}`);
  } else {
    emit(io, 'stdout', value);
  }
}

function emitWrite(io, target, request, result, format) {
  const value = {
    ok: true,
    operation: request.operation,
    resource: request.resource,
    location: target.location,
    selector: result.selector,
    changed: result.changed,
    validation: result.validation,
  };
  if (format === 'text') {
    const label = { add: 'Added', create: 'Created', update: 'Updated', remove: 'Removed', move: 'Moved' }[request.operation];
    emitText(io, `${label} ${request.resource} at ${target.location}.`);
  } else {
    emit(io, 'stdout', value);
  }
}

function validationFailure(result) {
  if (result.errors.length === 0) return null;
  const code = result.errors.some((error) => /:\s*\//.test(error)) ? 'schema_invalid' : 'cross_validation';
  return new ResourceRequestError(code, 'The proposed document did not pass validation.');
}

function validateMutation(target, request, document) {
  const replacement = { path: target.path, fileName: request.definition.document, data: document.toJSON() };
  const result = request.definition.target === 'workspace'
    ? validateProfileClosure(target.workspace, replacement)
    : validateProgramClosure(target.workspace, request.program, replacement);
  const failure = validationFailure(result);
  if (failure) throw failure;
  return {
    document: 'passed',
    scope: request.definition.target === 'workspace' ? 'profile' : 'target-program',
    passed: true,
  };
}

async function writeResource(target, request, payload) {
  return withTargetLock(target.path, async () => {
    const document = request.operation === 'create'
      ? createFromTemplate(request.resource, payload, target, request.asOf)
      : loadRoundTripDocument(target.path);
    const mutation = request.operation === 'create'
      ? { selector: null, changed: [request.resource] }
      : applyResourceOperation(document, request, payload ?? {});
    const validation = validateMutation(target, request, document);
    atomicReplace(target.path, document.toString());
    return { ...mutation, validation };
  });
}

export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr, cwd: process.cwd() }) {
  try {
    const { positionals, options } = parseArguments(argv);
    if (options.help) {
      if (positionals.length > 0) throw new ResourceRequestError('invalid_target', '--help cannot be combined with a command.');
      io.stdout.write(`${HELP}\n`);
      return 0;
    }
    if (positionals[0] === 'help') {
      if (positionals.length > 2) throw new ResourceRequestError('invalid_target', 'help accepts at most one resource.');
      validateCommonOptions(options);
      for (const name of Object.keys(options)) {
        if (name !== 'format') throw new ResourceRequestError('invalid_target', `help does not accept --${name}.`);
      }
      emitHelp(io, positionals[1], options.format);
      return 0;
    }
    if (positionals[0] === 'validate') {
      if (positionals.length !== 1) throw new ResourceRequestError('invalid_target', 'validate does not accept a resource.');
      validateCommonOptions(options);
      if (options.data !== undefined || options['data-file'] !== undefined || options.fields !== undefined || options.quiet) {
        throw new ResourceRequestError('invalid_payload', 'validate does not accept write or projection options.');
      }
      for (const name of ['id', 'mesocycle', 'before', 'after', 'as-of']) {
        if (options[name] !== undefined) throw new ResourceRequestError('invalid_target', `validate does not accept --${name}.`);
      }
      const workspace = options.workspace ?? io.cwd ?? process.cwd();
      let result;
      let scope;
      if (options.scope === 'workspace' && options.program === undefined) {
        const target = resolveTarget(workspace, resolveResourceRequest({ verb: 'get', resource: 'profile', options: {} }));
        result = validateWorkspace(target.workspace);
        scope = 'workspace';
      } else if (options.scope === undefined && options.program !== undefined) {
        const request = resolveResourceRequest({ verb: 'get', resource: 'program-status', options: { program: options.program } });
        const target = resolveTarget(workspace, request);
        result = validateProgramClosure(target.workspace, request.program);
        scope = 'target-program';
      } else {
        throw new ResourceRequestError('invalid_target', 'validate requires exactly --scope workspace or --program <id>.');
      }
      const failure = validationFailure(result);
      if (failure) throw failure;
      const value = { ok: true, operation: 'validate', scope, validation: { passed: true, documentCount: result.documentCount, warnings: result.warnings } };
      if (options.format === 'text') emitText(io, `Validation passed for ${scope}.`);
      else emit(io, 'stdout', value);
      return 0;
    }
    if (positionals.length !== 2) throw new ResourceRequestError('invalid_target', 'Expected a verb and resource.');
    const [verb, resource] = positionals;
    validateCommonOptions(options);
    const request = resolveResourceRequest({ verb, resource, options });
    const payload = parsePayload(options, io.cwd ?? process.cwd(), verb);
    if (verb === 'update' && Object.keys(payload).length === 0) {
      throw new ResourceRequestError('invalid_payload', 'Update payload must include at least one mutable field.');
    }
    if (['remove', 'move'].includes(verb) && Object.keys(payload).length !== 0) {
      throw new ResourceRequestError('invalid_payload', `${verb} requires --data '{}'.`);
    }
    if (options.fields !== undefined && verb !== 'list') throw new ResourceRequestError('invalid_payload', '--fields is only valid for list.');
    if (verb === 'get' || verb === 'list') {
      const target = resolveTarget(options.workspace ?? io.cwd ?? process.cwd(), request);
      if (!existsSync(target.path)) throw new ResourceRequestError('not_found', `Target document does not exist: ${target.location}.`);
      emitRead(io, request, target, readResource(loadRoundTripDocument(target.path), request), options.fields, options.format);
      return 0;
    }
    const target = resolveTarget(options.workspace ?? io.cwd ?? process.cwd(), request);
    const result = await writeResource(target, request, payload);
    if (!options.quiet) {
      emitWrite(io, target, request, result, options.format);
    }
    return 0;
  } catch (error) {
    if (error instanceof ResourceRequestError) {
      emitError(io, error.code, error.message);
      return 1;
    }
    emitError(io, 'invalid_payload', error instanceof Error ? error.message : 'Invalid command.');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
