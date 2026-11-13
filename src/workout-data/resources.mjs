import { isMap, isSeq } from 'yaml';

const singleton = 'singleton';
const identified = 'id';
const appendOnly = 'none';

function definition(document, target, route, selector, verbs, options = {}) {
  return Object.freeze({ document, target, route, selector, verbs: Object.freeze(verbs), ...options });
}

export const RESOURCE_DEFINITIONS = Object.freeze({
  profile: definition('profile.yaml', 'workspace', [], singleton, ['get', 'create', 'update'], {
    create: { required: ['language', 'units', 'equipment'], optional: ['coach_style'] },
    update: ['language', 'coach_style', 'units'], forbidden: ['meta'],
  }),
  'profile-equipment': definition('profile.yaml', 'workspace', ['equipment'], identified, ['list', 'get', 'add', 'update', 'remove'], {
    selectorKey: 'id', add: { required: ['id', 'name', 'category'], optional: ['muscles', 'notes'] }, update: ['name', 'category', 'muscles', 'notes'], forbidden: ['id'],
  }),
  'program-status': definition('status.yaml', 'program', [], singleton, ['get', 'create', 'update'], {
    create: { required: ['status', 'start_date'], optional: ['current_mesocycle', 'current_week', 'end_date', 'last_session', 'next_session', 'next_session_id', 'pauses', 'notes'] },
    update: ['status', 'current_mesocycle', 'current_week', 'start_date', 'end_date', 'last_session', 'next_session', 'next_session_id'],
    forbidden: ['meta', 'program'],
  }),
  'status-pause': definition('status.yaml', 'program', ['pauses'], appendOnly, ['list', 'add'], {
    add: { required: ['start', 'end'], optional: ['reason'] },
  }),
  'status-note': definition('status.yaml', 'program', ['notes'], appendOnly, ['list', 'add'], {
    add: { required: ['text'], optional: [] }, itemPayload: 'text',
  }),
  goals: definition('goals.yaml', 'program', [], singleton, ['get', 'create'], {
    create: { required: ['goals', 'measurements'], optional: ['reference_loads'] }, forbidden: ['meta'],
  }),
  goal: definition('goals.yaml', 'program', ['goals'], identified, ['list', 'get', 'add', 'update', 'remove'], {
    selectorKey: 'id',
    add: { required: ['id', 'priority', 'description', 'tracked_measures'], optional: ['deadline'] },
    update: ['priority', 'description', 'tracked_measures', 'deadline'],
    forbidden: ['id'],
  }),
  measurement: definition('goals.yaml', 'program', ['measurements'], appendOnly, ['list', 'add'], {
    add: { required: ['date', 'values'], optional: ['context', 'notes'] },
  }),
  'reference-load': definition('goals.yaml', 'program', ['reference_loads'], appendOnly, ['list', 'add'], {
    add: { required: ['date', 'exercise', 'load', 'reps'], optional: [] },
  }),
  macrocycle: definition('macrocycle.yaml', 'program', [], singleton, ['get', 'create', 'update'], {
    create: { required: ['name', 'start_date', 'end_date', 'frequency', 'split', 'mesocycles', 'weekly_split'], optional: ['scheduling', 'cardio'] },
    update: ['name', 'start_date', 'end_date', 'frequency', 'split'], forbidden: ['meta'],
  }),
  'mesocycle-plan': definition('macrocycle.yaml', 'program', ['mesocycles'], identified, ['list', 'get', 'add', 'update', 'remove'], {
    selectorKey: 'number',
    add: { required: ['number', 'name', 'weeks', 'dates', 'goal', 'parameters'], optional: [] },
    update: ['name', 'weeks', 'dates', 'goal', 'parameters'],
    forbidden: ['number'],
  }),
  'macrocycle-revision': definition('macrocycle.yaml', 'program', ['meta', 'revisions'], appendOnly, ['list', 'add'], {
    add: { required: ['ref', 'date', 'summary'], optional: [] },
  }),
  'weekly-split': definition('macrocycle.yaml', 'program', ['weekly_split'], appendOnly, ['list', 'add'], {
    add: { required: ['session'], optional: ['day', 'muscle_groups'] },
  }),
  'macrocycle-cardio': definition('macrocycle.yaml', 'program', ['cardio'], appendOnly, ['list', 'add'], {
    add: { required: ['type', 'duration_min'], optional: ['frequency', 'notes'] },
  }),
  sessions: definition('sessions.yaml', 'mesocycle', [], singleton, ['get', 'create', 'update'], {
    create: { required: ['sessions'], optional: ['period', 'source', 'cardio'] },
    createRoutes: { period: ['meta', 'period'], source: ['meta', 'source'] },
    update: ['period', 'source'], updateRoutes: { period: ['meta', 'period'], source: ['meta', 'source'] }, forbidden: ['meta'],
  }),
  session: definition('sessions.yaml', 'mesocycle', ['sessions'], identified, ['list', 'get', 'add', 'update', 'remove', 'move'], {
    selectorKey: 'id', add: { required: ['id', 'name', 'format', 'exercises'], optional: ['days', 'circuit'] }, update: ['name', 'days', 'format', 'circuit'], forbidden: ['id', 'exercises'],
  }),
  'session-exercise': definition('sessions.yaml', 'mesocycle', ['sessions', '$session', 'exercises'], appendOnly, ['list', 'add', 'remove'], {
    owner: { option: 'id', resource: 'session', selectorKey: 'id' }, itemSelectorKey: 'order', itemSelectorLabel: 'exercise-order',
    add: { required: ['order', 'exercise', 'sets', 'reps'], optional: ['superset', 'rest_s', 'target_load', 'notes'] },
  }),
  'session-cardio': definition('sessions.yaml', 'mesocycle', ['cardio'], appendOnly, ['list', 'add'], {
    add: { required: ['type', 'duration_min'], optional: ['intensity', 'notes'] },
  }),
});

export class ResourceRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function invalidTarget(message) {
  return new ResourceRequestError('invalid_target', message);
}

function requiredOption(options, name, message) {
  const value = options[name];
  if (typeof value !== 'string' || value.length === 0) throw invalidTarget(message);
  return value;
}

function resolveSelector(definition, operation, options) {
  if (definition.owner) {
    return { [definition.owner.selectorKey]: requiredOption(options, 'id', 'This resource requires --id for its parent session.') };
  }
  if (definition.selector === identified && !['list', 'add'].includes(operation)) {
    const id = requiredOption(options, 'id', 'This resource requires --id.');
    if (definition.selectorKey === 'number') {
      if (!/^[1-9]\d*$/.test(id)) throw invalidTarget('--id must be a positive integer for mesocycle-plan.');
      return { number: Number(id) };
    }
    return { [definition.selectorKey]: id };
  }
  if (definition.selector !== identified && options.id !== undefined) {
    throw invalidTarget('This resource does not accept --id.');
  }
  if (definition.selector === identified && ['list', 'add'].includes(operation) && options.id !== undefined) {
    throw invalidTarget(`The ${operation} operation does not accept --id.`);
  }
  return null;
}

export function resolveResourceRequest(args) {
  const { verb: operation, resource, options = {} } = args;
  const definition = RESOURCE_DEFINITIONS[resource];
  if (!definition) throw invalidTarget(`Unknown resource: ${resource}.`);
  if (!definition.verbs.includes(operation)) throw invalidTarget(`${operation} is not supported for ${resource}.`);

  const needsProgram = definition.target !== 'workspace';
  const needsMesocycle = definition.target === 'mesocycle';
  const program = needsProgram ? requiredOption(options, 'program', 'This resource requires --program.') : undefined;
  let mesocycle;
  if (needsMesocycle) {
    const raw = requiredOption(options, 'mesocycle', 'This resource requires --mesocycle.');
    if (!/^[1-9]\d*$/.test(raw)) throw invalidTarget('--mesocycle must be a positive integer.');
    mesocycle = Number(raw);
  } else if (options.mesocycle !== undefined) {
    throw invalidTarget('This resource does not accept --mesocycle.');
  }

  if (operation === 'move') {
    const placements = ['before', 'after'].filter((name) => options[name] !== undefined);
    if (placements.length !== 1 || !options[placements[0]]) {
      throw invalidTarget('move requires exactly one nonempty --before or --after selector.');
    }
  } else if (options.before !== undefined || options.after !== undefined) {
    throw invalidTarget('--before and --after are only valid for move session.');
  }

  const requiresItemSelector = definition.itemSelectorKey && !['list', 'add'].includes(operation);
  if (requiresItemSelector) {
    requiredOption(options, 'order', `This resource requires --order for its exercise.`);
  } else if (options.order !== undefined) {
    throw invalidTarget('This resource does not accept --order.');
  }

  return Object.freeze({
    operation,
    resource,
    definition,
    program,
    mesocycle,
    selector: resolveSelector(definition, operation, options),
    itemSelector: requiresItemSelector ? { [definition.itemSelectorKey]: options.order } : null,
    placement: operation === 'move' ? (options.before === undefined ? { after: options.after } : { before: options.before }) : null,
    asOf: options['as-of'],
  });
}

function invalidPayload(message) {
  return new ResourceRequestError('invalid_payload', message);
}

function selectorError(matches, selector) {
  if (matches.length === 0) throw new ResourceRequestError('not_found', `No resource matches ${JSON.stringify(selector)}.`);
  if (matches.length > 1) throw new ResourceRequestError('conflict', `Multiple resources match ${JSON.stringify(selector)}.`);
  return matches[0];
}

function assertDocument(document) {
  if (!document?.contents || !isMap(document.contents)) throw new ResourceRequestError('unsupported_yaml', 'The YAML document must contain one mapping.');
}

function routeNode(document, request) {
  const { definition } = request;
  let route = definition.route;
  if (definition.owner) {
    const sessions = document.get('sessions', true);
    if (!isSeq(sessions)) throw new ResourceRequestError('unsupported_yaml', 'The sessions collection must be a YAML sequence.');
    const owner = selectorError(findMatches(sessions, request.selector), request.selector);
    route = ['sessions', owner.index, 'exercises'];
  }
  const node = route.length === 0 ? document.contents : document.getIn(route, true);
  if (definition.selector === singleton) return node;
  if (!isSeq(node)) throw new ResourceRequestError('unsupported_yaml', `The ${request.resource} collection must be a YAML sequence.`);
  return node;
}

function valueOf(node) {
  return node?.toJSON?.() ?? node;
}

function findMatches(sequence, selector) {
  if (!selector) return [];
  const [key, wanted] = Object.entries(selector)[0];
  return sequence.items.reduce((matches, item, index) => {
    if (!isMap(item)) return matches;
    const value = valueOf(item.get(key, true));
    if (value === wanted || (key === 'order' && String(value) === wanted)) matches.push({ item, index });
    return matches;
  }, []);
}

function selectedNode(document, request) {
  const collection = routeNode(document, request);
  if (request.definition.selector === singleton) return { item: collection, index: null };
  return selectorError(findMatches(collection, request.selector), request.selector);
}

function assertPayload(payload) {
  if (payload === null || Array.isArray(payload) || typeof payload !== 'object') throw invalidPayload('Payload must be a JSON object.');
}

function assertAllowedPayload(definition, operation, payload) {
  const allowed = operation === 'add' ? definition.add : definition.update;
  if (!allowed) return;
  if (operation === 'update' && Object.keys(payload).length === 0) {
    throw invalidPayload('Update payload must include at least one mutable field.');
  }
  const allowedKeys = new Set(Array.isArray(allowed) ? allowed : [...allowed.required, ...allowed.optional]);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) throw invalidPayload(`Payload field is not mutable: ${key}.`);
  }
  if (!Array.isArray(allowed)) {
    for (const key of allowed.required) {
      if (!Object.hasOwn(payload, key)) throw invalidPayload(`Payload is missing required field: ${key}.`);
    }
  }
}

function setMapFields(node, payload) {
  if (!isMap(node)) throw new ResourceRequestError('unsupported_yaml', 'The selected resource must be a YAML mapping.');
  for (const [key, value] of Object.entries(payload)) node.set(key, value);
}

function touchVersion(document, request) {
  if (!['macrocycle.yaml', 'sessions.yaml'].includes(request.definition.document)) return;
  const version = document.getIn(['meta', 'version']);
  if (!Number.isInteger(version)) throw new ResourceRequestError('schema_invalid', 'meta.version must be an integer before it can be incremented.');
  document.setIn(['meta', 'version'], version + 1);
  const asOf = request.asOf ?? new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  document.setIn(['meta', 'last_modified'], asOf);
}

export function readResource(document, request) {
  if (!request || !RESOURCE_DEFINITIONS[request.resource]) throw invalidTarget('Unknown resource request.');
  assertDocument(document);
  if (request.operation === 'list') {
    const collection = routeNode(document, request);
    return { selector: null, items: collection.items.map(valueOf) };
  }
  const selected = selectedNode(document, request);
  return { selector: request.selector, data: valueOf(selected.item) };
}

export function applyResourceOperation(document, request, payload) {
  if (!request || !RESOURCE_DEFINITIONS[request.resource]) throw invalidTarget('Unknown resource request.');
  assertDocument(document);
  assertPayload(payload);
  const { definition, operation } = request;
  if (!['add', 'update', 'remove', 'move'].includes(operation)) throw invalidTarget(`${operation} does not mutate ${request.resource}.`);

  if (operation === 'add') {
    const collection = routeNode(document, request);
    assertAllowedPayload(definition, operation, payload);
    if (definition.selector === identified) {
      const key = definition.selectorKey;
      if (!Object.hasOwn(payload, key)) throw invalidPayload(`Payload is missing required field: ${key}.`);
      if (findMatches(collection, { [key]: payload[key] }).length > 0) {
        throw new ResourceRequestError('already_exists', `A resource already uses ${key} ${JSON.stringify(payload[key])}.`);
      }
    } else if (definition.itemSelectorKey) {
      const key = definition.itemSelectorKey;
      if (findMatches(collection, { [key]: payload[key] }).length > 0) {
        throw new ResourceRequestError('already_exists', `A resource already uses ${key} ${JSON.stringify(payload[key])}.`);
      }
    }
    collection.add(definition.itemPayload ? payload[definition.itemPayload] : payload);
  } else {
    const collection = definition.selector === singleton ? null : routeNode(document, request);
    const selected = definition.selector === singleton
      ? selectedNode(document, request)
      : selectorError(findMatches(collection, request.itemSelector ?? request.selector), request.itemSelector ?? request.selector);
    if ((operation === 'remove' || operation === 'move') && Object.keys(payload).length !== 0) {
      throw invalidPayload(`${operation} requires an empty payload object.`);
    }
    if (operation === 'update') {
      assertAllowedPayload(definition, operation, payload);
      if (request.resource === 'session' && payload.format === 'circuit' && !Object.hasOwn(payload, 'circuit')) {
        throw invalidPayload('A circuit session update requires circuit.');
      }
      if (definition.updateRoutes) {
        for (const [key, value] of Object.entries(payload)) document.setIn(definition.updateRoutes[key], value);
      } else {
        setMapFields(selected.item, payload);
      }
      if (request.resource === 'session' && payload.format === 'standard') selected.item.delete('circuit');
    } else if (operation === 'remove') {
      collection.delete(selected.index);
    } else {
      const [direction, adjacentId] = Object.entries(request.placement)[0];
      const adjacent = selectorError(findMatches(collection, { [definition.selectorKey]: adjacentId }), { [definition.selectorKey]: adjacentId });
      if (adjacent.index === selected.index) throw invalidPayload('A session cannot be moved relative to itself.');
      const [item] = collection.items.splice(selected.index, 1);
      let targetIndex = collection.items.indexOf(adjacent.item);
      if (direction === 'after') targetIndex += 1;
      collection.items.splice(targetIndex, 0, item);
    }
  }
  touchVersion(document, request);
  return { selector: request.itemSelector ? { ...request.selector, ...request.itemSelector } : request.selector, changed: [definition.route[0] ?? request.resource] };
}
