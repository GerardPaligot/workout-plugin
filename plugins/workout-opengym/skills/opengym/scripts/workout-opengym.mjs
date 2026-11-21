#!/usr/bin/env node

// src/opengym/cli.mjs
import path3 from "node:path";
import { realpathSync as realpathSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";

// src/opengym/store.mjs
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import path from "node:path";
var hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== void 0) return fallback;
    throw error;
  }
}
async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 448 });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temp, "wx", 384);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, file);
    const dir = await open(path.dirname(file), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
var Store = class {
  constructor(root, scope) {
    this.dir = path.join(root || path.join(homedir(), ".local", "share", "workout-opengym"), hash(scope));
    this.file = path.join(this.dir, "state.json");
    this.lock = path.join(this.dir, "lock");
    this.scope = scope;
  }
  async run(fn, recover = false) {
    await mkdir(this.dir, { recursive: true, mode: 448 });
    const gate = path.join(this.dir, "acquisition");
    try {
      await mkdir(gate);
    } catch (error) {
      if (error.code === "EEXIST") throw new Error("Store acquisition interrupted or in progress; inspect acquisition directory manually");
      throw error;
    }
    try {
      try {
        await mkdir(this.lock);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (!recover) throw new Error("Store locked; inspect lock owner and use --recover-lock only after confirming it is stale");
        const owner = await readJson(path.join(this.lock, "owner.json"), null);
        if (!owner || owner.host !== hostname() || !Number.isInteger(owner.pid)) throw new Error("Cannot establish stale lock owner");
        try {
          process.kill(owner.pid, 0);
          throw new Error("Lock owner is still running");
        } catch (e) {
          if (e.code !== "ESRCH") throw e;
        }
        await rm(this.lock, { recursive: true });
        await mkdir(this.lock);
      }
    } finally {
      await rm(gate, { recursive: true, force: true });
    }
    try {
      await atomicJson(path.join(this.lock, "owner.json"), { pid: process.pid, host: hostname(), startedAt: (/* @__PURE__ */ new Date()).toISOString() });
      const state = await readJson(this.file, { version: 1, scope: this.scope, mappings: {}, assignments: [], workouts: {}, publications: [], jobs: [], observation: null });
      if (state.version !== 1 || hash(state.scope) !== hash(this.scope) || !Array.isArray(state.jobs) || !Array.isArray(state.assignments) || !state.workouts || typeof state.workouts !== "object") throw new Error("Invalid scoped store");
      const save = () => atomicJson(this.file, state);
      return await fn(state, save);
    } finally {
      await rm(this.lock, { recursive: true, force: true });
    }
  }
};

// src/opengym/engine.mjs
import path2 from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";
import { realpathSync, lstatSync, readFileSync } from "node:fs";

// node_modules/js-yaml/dist/js-yaml.mjs
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") for (var keys2 = __getOwnPropNames(from), i = 0, n = keys2.length, key; i < n; i++) {
    key = keys2[i];
    if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
      get: ((k) => from[k]).bind(null, key),
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
  value: mod,
  enumerable: true
}) : target, mod));
var require_common = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result2 = "";
    for (let cycle = 0; cycle < count; cycle += 1) result2 += string;
    return result2;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  module.exports.isNothing = isNothing;
  module.exports.isObject = isObject;
  module.exports.toArray = toArray;
  module.exports.repeat = repeat;
  module.exports.isNegativeZero = isNegativeZero;
  module.exports.extend = extend;
}));
var require_exception = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  function formatError(exception, compact) {
    let where = "";
    const message = exception.reason || "(unknown reason)";
    if (!exception.mark) return message;
    if (exception.mark.name) where += 'in "' + exception.mark.name + '" ';
    where += "(" + (exception.mark.line + 1) + ":" + (exception.mark.column + 1) + ")";
    if (!compact && exception.mark.snippet) where += "\n\n" + exception.mark.snippet;
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
    else this.stack = (/* @__PURE__ */ new Error()).stack || "";
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  module.exports = YAMLException2;
}));
var require_snippet = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
    };
  }
  function padStart(string, max) {
    return common.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match;
    let foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) foundLineNo = lineStarts.length - 2;
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result2 = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
      result2 = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result2;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result2 += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result2 += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
      result2 += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result2.replace(/\n$/, "");
  }
  module.exports = makeSnippet;
}));
var require_type = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var YAMLException2 = require_exception();
  var TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  var YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map) {
    const result2 = {};
    if (map !== null) Object.keys(map).forEach(function(style) {
      map[style].forEach(function(alias) {
        result2[String(alias)] = style;
      });
    });
    return result2;
  }
  function Type2(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
  module.exports = Type2;
}));
var require_schema = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var YAMLException2 = require_exception();
  var Type2 = require_type();
  function compileList(schema, name) {
    const result2 = [];
    schema[name].forEach(function(currentType) {
      let newIndex = result2.length;
      result2.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) newIndex = previousIndex;
      });
      result2[newIndex] = currentType;
    });
    return result2;
  }
  function compileMap() {
    const result2 = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    };
    function collectType(type) {
      if (type.multi) {
        result2.multi[type.kind].push(type);
        result2.multi["fallback"].push(type);
      } else result2[type.kind][type.tag] = result2["fallback"][type.tag] = type;
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) arguments[index].forEach(collectType);
    return result2;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type2) explicit.push(definition);
    else if (Array.isArray(definition)) explicit = explicit.concat(definition);
    else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    implicit.forEach(function(type) {
      if (!(type instanceof Type2)) throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      if (type.loadKind && type.loadKind !== "scalar") throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      if (type.multi) throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    });
    explicit.forEach(function(type) {
      if (!(type instanceof Type2)) throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    });
    const result2 = Object.create(Schema2.prototype);
    result2.implicit = (this.implicit || []).concat(implicit);
    result2.explicit = (this.explicit || []).concat(explicit);
    result2.compiledImplicit = compileList(result2, "implicit");
    result2.compiledExplicit = compileList(result2, "explicit");
    result2.compiledTypeMap = compileMap(result2.compiledImplicit, result2.compiledExplicit);
    return result2;
  };
  module.exports = Schema2;
}));
var require_str = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_type())("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
}));
var require_seq = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_type())("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
}));
var require_map = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_type())("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
}));
var require_failsafe = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = new (require_schema())({ explicit: [
    require_str(),
    require_seq(),
    require_map()
  ] });
}));
var require_null = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  function resolveYamlNull(data) {
    if (data === null) return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  module.exports = new Type2("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
}));
var require_bool = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  module.exports = new Type2("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
}));
var require_int = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var Type2 = require_type();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max) return false;
    let ch = data[index];
    if (ch === "-" || ch === "+") ch = data[++index];
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) return false;
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return Number.isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign = 1;
    let ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && object % 1 === 0 && !common.isNegativeZero(object);
  }
  module.exports = new Type2("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
}));
var require_float = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var Type2 = require_type();
  var YAML_FLOAT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  var YAML_FLOAT_SPECIAL_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) return false;
    if (Number.isFinite(parseFloat(data, 10))) return true;
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) value = value.slice(1);
    if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    else if (value === ".nan") return NaN;
    return sign * parseFloat(value, 10);
  }
  var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
    else if (Number.POSITIVE_INFINITY === object) switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
    else if (Number.NEGATIVE_INFINITY === object) switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
    else if (common.isNegativeZero(object)) return "-0.0";
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
  }
  module.exports = new Type2("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
}));
var require_json = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = require_failsafe().extend({ implicit: [
    require_null(),
    require_bool(),
    require_int(),
    require_float()
  ] });
}));
var require_core = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = require_json();
}));
var require_timestamp = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var YAML_DATE_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
  var YAML_TIMESTAMP_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    const year = +match[1];
    const month = +match[2] - 1;
    const day = +match[3];
    if (!match[4]) return new Date(Date.UTC(year, month, day));
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) fraction += "0";
      fraction = +fraction;
    }
    if (match[9]) {
      const tzHour = +match[10];
      const tzMinute = +(match[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  module.exports = new Type2("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
}));
var require_merge = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  module.exports = new Type2("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
}));
var require_binary = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map = BASE64_MAP;
    let bits = 0;
    const result2 = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result2.push(bits >> 16 & 255);
        result2.push(bits >> 8 & 255);
        result2.push(bits & 255);
      }
      bits = bits << 6 | map.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result2.push(bits >> 16 & 255);
      result2.push(bits >> 8 & 255);
      result2.push(bits & 255);
    } else if (tailbits === 18) {
      result2.push(bits >> 10 & 255);
      result2.push(bits >> 2 & 255);
    } else if (tailbits === 12) result2.push(bits >> 4 & 255);
    return new Uint8Array(result2);
  }
  function representYamlBinary(object) {
    let result2 = "";
    let bits = 0;
    const max = object.length;
    const map = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result2 += map[bits >> 18 & 63];
        result2 += map[bits >> 12 & 63];
        result2 += map[bits >> 6 & 63];
        result2 += map[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result2 += map[bits >> 18 & 63];
      result2 += map[bits >> 12 & 63];
      result2 += map[bits >> 6 & 63];
      result2 += map[bits & 63];
    } else if (tail === 2) {
      result2 += map[bits >> 10 & 63];
      result2 += map[bits >> 4 & 63];
      result2 += map[bits << 2 & 63];
      result2 += map[64];
    } else if (tail === 1) {
      result2 += map[bits >> 2 & 63];
      result2 += map[bits << 4 & 63];
      result2 += map[64];
      result2 += map[64];
    }
    return result2;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  module.exports = new Type2("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
}));
var require_omap = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = [];
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) if (_hasOwnProperty.call(pair, pairKey)) if (!pairHasKey) pairHasKey = true;
      else return false;
      if (!pairHasKey) return false;
      if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
      else return false;
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  module.exports = new Type2("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
}));
var require_pairs = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    const object = data;
    const result2 = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys2 = Object.keys(pair);
      if (keys2.length !== 1) return false;
      result2[index] = [keys2[0], pair[keys2[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object = data;
    const result2 = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      const keys2 = Object.keys(pair);
      result2[index] = [keys2[0], pair[keys2[0]]];
    }
    return result2;
  }
  module.exports = new Type2("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
}));
var require_set = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var Type2 = require_type();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) if (_hasOwnProperty.call(object, key)) {
      if (object[key] !== null) return false;
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  module.exports = new Type2("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
}));
var require_default = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  module.exports = require_core().extend({
    implicit: [require_timestamp(), require_merge()],
    explicit: [
      require_binary(),
      require_omap(),
      require_pairs(),
      require_set()
    ]
  });
}));
var require_loader = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var YAMLException2 = require_exception();
  var makeSnippet = require_snippet();
  var DEFAULT_SCHEMA2 = require_default();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CONTEXT_FLOW_IN = 1;
  var CONTEXT_FLOW_OUT = 2;
  var CONTEXT_BLOCK_IN = 3;
  var CONTEXT_BLOCK_OUT = 4;
  var CHOMPING_CLIP = 1;
  var CHOMPING_STRIP = 2;
  var CHOMPING_KEEP = 3;
  var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  var PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  var PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  var PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) return c - 48;
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) return lc - 97 + 10;
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) return 2;
    if (c === 117) return 4;
    if (c === 85) return 8;
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) return c - 48;
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\0";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "	";
      case 9:
        return "	";
      case 110:
        return "\n";
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "\x85";
      case 95:
        return "\xA0";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
  }
  function charFromCodepoint(c) {
    if (c <= 65535) return String.fromCharCode(c);
    return String.fromCharCode((c - 65536 >> 10) + 55296, (c - 65536 & 1023) + 56320);
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
    else object[key] = value;
  }
  var simpleEscapeCheck = new Array(256);
  var simpleEscapeMap = new Array(256);
  for (let i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxMergeSeqLength = typeof options["maxMergeSeqLength"] === "number" ? options["maxMergeSeqLength"] : 20;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) state.onWarning.call(null, generateError(state, message));
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) transaction[name] = {
        existed: _hasOwnProperty.call(state.anchorMap, name),
        value: state.anchorMap[name]
      };
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0) return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length; index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) parent[name] = transaction[name];
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) state.anchorMap[names[index]] = entry.value;
      else delete state.anchorMap[names[index]];
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  var directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) throwError(state, "duplication of %YAML directive");
      if (args.length !== 1) throwError(state, "YAML directive accepts exactly one argument");
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) throwError(state, "ill-formed argument of the YAML directive");
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major !== 1) throwError(state, "unacceptable YAML version of the document");
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) throwWarning(state, "unsupported YAML version of the document");
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) throwError(state, "TAG directive accepts exactly two arguments");
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      if (_hasOwnProperty.call(state.tagMap, handle)) throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      if (!PATTERN_TAG_URI.test(prefix)) throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
        const _character = _result.charCodeAt(_position);
        if (!(_character === 9 || _character >= 32 && _character <= 1114111)) throwError(state, "expected valid JSON character");
      }
      else if (PATTERN_NON_PRINTABLE.test(_result)) throwError(state, "the stream contains non-printable characters");
      state.result += _result;
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common.isObject(source)) throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) throwError(state, "nested arrays are not supported inside keys");
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") keyNode[index] = "[object Object]";
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") keyNode = "[object Object]";
    keyNode = String(keyNode);
    if (_result === null) _result = {};
    if (keyTag === "tag:yaml.org,2002:merge") if (Array.isArray(valueNode)) {
      if (valueNode.length > state.maxMergeSeqLength) throwError(state, "merge sequence length exceeded maxMergeSeqLength (" + state.maxMergeSeqLength + ")");
      const seen = /* @__PURE__ */ new Set();
      for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        const src = valueNode[index];
        if (seen.has(src)) continue;
        seen.add(src);
        mergeMappings(state, _result, src, overridableKeys);
      }
    } else mergeMappings(state, _result, valueNode, overridableKeys);
    else {
      if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 10) state.position++;
    else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) state.position++;
    } else throwError(state, "a line break is expected");
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) state.firstTabInLine = state.position;
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) do
        ch = state.input.charCodeAt(++state.position);
      while (ch !== 10 && ch !== 13 && ch !== 0);
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else break;
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) throwWarning(state, "deficient indentation");
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) return true;
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) state.result += " ";
    else if (count > 1) state.result += common.repeat("\n", count - 1);
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) return false;
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) return false;
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) break;
      } else if (ch === 35) {
        if (isWsOrEol(state.input.charCodeAt(state.position - 1))) break;
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) break;
      else if (isEol(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) captureEnd = state.position + 1;
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) return true;
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) return false;
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else return true;
    } else if (isEol(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a single quoted scalar");
    else {
      state.position++;
      if (!isWhiteSpace(ch)) captureEnd = state.position;
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) return false;
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (isEol(ch)) skipSeparationSpace(state, false, nodeIndent);
      else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        let hexLength = tmp;
        let hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) hexResult = (hexResult << 4) + tmp;
          else throwError(state, "expected hexadecimal character");
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else throwError(state, "unknown escape sequence");
      captureStart = captureEnd = state.position;
    } else if (isEol(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a double quoted scalar");
    else {
      state.position++;
      if (!isWhiteSpace(ch)) captureEnd = state.position;
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) throwError(state, "missed comma between flow collection entries");
      else if (ch === 44) throwError(state, "expected the node content, but found ','");
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        if (isWsOrEol(state.input.charCodeAt(state.position + 1))) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      else if (isPair) _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      else _result.push(keyNode);
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else readNext = false;
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 124) folding = false;
    else if (ch === 62) folding = true;
    else return false;
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) if (CHOMPING_CLIP === chomping) chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      else throwError(state, "repeat of a chomping mode identifier");
      else if ((tmp = fromDecimalCode(ch)) >= 0) if (tmp === 0) throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else throwError(state, "repeat of an indentation width identifier");
      else break;
    }
    if (isWhiteSpace(ch)) {
      do
        ch = state.input.charCodeAt(++state.position);
      while (isWhiteSpace(ch));
      if (ch === 35) do
        ch = state.input.charCodeAt(++state.position);
      while (!isEol(ch) && ch !== 0);
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) textIndent = state.lineIndent;
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) throwError(state, "missing indentation for block scalar");
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) state.result += "\n";
        }
        break;
      }
      if (folding) if (isWhiteSpace(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) state.result += " ";
      } else state.result += common.repeat("\n", emptyLines);
      else state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) ch = state.input.charCodeAt(++state.position);
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) break;
      if (!isWsOrEol(state.input.charCodeAt(state.position + 1))) break;
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      const _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a sequence entry");
      else if (state.lineIndent < nodeIndent) break;
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) break;
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) throwError(state, "can not read an implicit mapping pair; a colon is missed");
          else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) if (atExplicitKey) keyNode = state.result;
        else valueNode = state.result;
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a mapping entry");
      else if (state.lineIndent < nodeIndent) break;
    }
    if (atExplicitKey) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) throwError(state, "duplication of a tag property");
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else tagHandle = "!";
    let _position = state.position;
    if (isVerbatim) {
      do
        ch = state.input.charCodeAt(++state.position);
      while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else throwError(state, "unexpected end of the stream within a verbatim tag");
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) throwError(state, "named tag handle cannot contain such characters");
          isNamed = true;
          _position = state.position + 1;
        } else throwError(state, "tag suffix cannot contain exclamation marks");
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) throwError(state, "tag suffix cannot contain flow indicator characters");
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) throwError(state, "tag name cannot contain such characters: " + tagName);
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) state.tag = tagName;
    else if (_hasOwnProperty.call(state.tagMap, tagHandle)) state.tag = state.tagMap[tagHandle] + tagName;
    else if (tagHandle === "!") state.tag = "!" + tagName;
    else if (tagHandle === "!!") state.tag = "tag:yaml.org,2002:" + tagName;
    else throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) throwError(state, "duplication of an anchor property");
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
    if (state.position === _position) throwError(state, "name of an anchor node must contain at least one character");
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
    if (state.position === _position) throwError(state, "name of an alias node must contain at least one character");
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) throwError(state, 'unidentified alias "' + alias + '"');
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    state.depth += 1;
    if (state.listener !== null) state.listener("open", state);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) indentStatus = 1;
        else if (state.lineIndent === parentIndent) indentStatus = 0;
        else if (state.lineIndent < parentIndent) indentStatus = -1;
      }
    }
    if (indentStatus === 1) while (true) {
      const ch = state.input.charCodeAt(state.position);
      const propertyState = snapshotState(state);
      if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) break;
      if (!readTagProperty(state) && !readAnchorProperty(state)) break;
      if (propertyStart === null) propertyStart = propertyState;
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) indentStatus = 1;
        else if (state.lineIndent === parentIndent) indentStatus = 0;
        else if (state.lineIndent < parentIndent) indentStatus = -1;
      } else allowBlockCollections = false;
    }
    if (allowBlockCollections) allowBlockCollections = atNewLine || allowCompact;
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) flowIndent = parentIndent;
      else flowIndent = parentIndent + 1;
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) hasContent = true;
      else {
        const ch = state.input.charCodeAt(state.position);
        if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(state, propertyStart, propertyStart.position - propertyStart.lineStart, flowIndent)) hasContent = true;
        else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) hasContent = true;
        else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) throwError(state, "alias node should not have any properties");
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) state.tag = "?";
        }
        if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
      }
      else if (indentStatus === 0) hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
    if (state.tag === null) {
      if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type = state.implicitTypes[typeIndex];
        if (type.resolve(state.result)) {
          state.result = type.construct(state.result);
          state.tag = type.tag;
          if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) type = state.typeMap[state.kind || "fallback"][state.tag];
      else {
        type = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type = typeList[typeIndex];
          break;
        }
      }
      if (!type) throwError(state, "unknown tag !<" + state.tag + ">");
      if (state.result !== null && type.kind !== state.kind) throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
      if (!type.resolve(state.result, state.tag)) throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      else {
        state.result = type.construct(state.result, state.tag);
        if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
      }
    }
    if (state.listener !== null) state.listener("close", state);
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) break;
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) throwError(state, "directive name must not be less than one character in length");
      while (ch !== 0) {
        while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
        if (ch === 35) {
          do
            ch = state.input.charCodeAt(++state.position);
          while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) directiveHandlers[directiveName](state, directiveName, directiveArgs);
      else throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) throwError(state, "directives end mark is expected");
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) throwWarning(state, "non-ASCII line breaks are interpreted as content");
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) throwError(state, "end of the stream or a document separator is expected");
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) input += "\n";
      if (input.charCodeAt(0) === 65279) input = input.slice(1);
    }
    const state = new State(input, options);
    const nullpos = input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) readDocument(state);
    return state.documents;
  }
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") return documents;
    for (let index = 0, length = documents.length; index < length; index += 1) iterator(documents[index]);
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) return;
    else if (documents.length === 1) return documents[0];
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  module.exports.loadAll = loadAll2;
  module.exports.load = load2;
}));
var require_dumper = /* @__PURE__ */ __commonJSMin(((exports, module) => {
  var common = require_common();
  var YAMLException2 = require_exception();
  var DEFAULT_SCHEMA2 = require_default();
  var _toString = Object.prototype.toString;
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CHAR_BOM = 65279;
  var CHAR_TAB = 9;
  var CHAR_LINE_FEED = 10;
  var CHAR_CARRIAGE_RETURN = 13;
  var CHAR_SPACE = 32;
  var CHAR_EXCLAMATION = 33;
  var CHAR_DOUBLE_QUOTE = 34;
  var CHAR_SHARP = 35;
  var CHAR_PERCENT = 37;
  var CHAR_AMPERSAND = 38;
  var CHAR_SINGLE_QUOTE = 39;
  var CHAR_ASTERISK = 42;
  var CHAR_COMMA = 44;
  var CHAR_MINUS = 45;
  var CHAR_COLON = 58;
  var CHAR_EQUALS = 61;
  var CHAR_GREATER_THAN = 62;
  var CHAR_QUESTION = 63;
  var CHAR_COMMERCIAL_AT = 64;
  var CHAR_LEFT_SQUARE_BRACKET = 91;
  var CHAR_RIGHT_SQUARE_BRACKET = 93;
  var CHAR_GRAVE_ACCENT = 96;
  var CHAR_LEFT_CURLY_BRACKET = 123;
  var CHAR_VERTICAL_LINE = 124;
  var CHAR_RIGHT_CURLY_BRACKET = 125;
  var ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  var DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema, map) {
    if (map === null) return {};
    const result2 = {};
    const keys2 = Object.keys(map);
    for (let index = 0, length = keys2.length; index < length; index += 1) {
      let tag = keys2[index];
      let style = String(map[tag]);
      if (tag.slice(0, 2) === "!!") tag = "tag:yaml.org,2002:" + tag.slice(2);
      const type = schema.compiledTypeMap["fallback"][tag];
      if (type && _hasOwnProperty.call(type.styleAliases, style)) style = type.styleAliases[style];
      result2[tag] = style;
    }
    return result2;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    return "\\" + handle + common.repeat("0", length - string.length) + string;
  }
  var QUOTING_TYPE_SINGLE = 1;
  var QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    const ind = common.repeat(" ", spaces);
    let position = 0;
    let result2 = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result2 += ind;
      result2 += line;
    }
    return result2;
  }
  function generateNextLine(state, level) {
    return "\n" + common.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) if (state.implicitTypes[index].resolve(str)) return true;
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar;
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) return (first - 55296) * 1024 + second - 56320 + 65536;
    }
    return first;
  }
  function needIndentIndicator(string) {
    return /^\n* /.test(string);
  }
  var STYLE_PLAIN = 1;
  var STYLE_SINGLE = 2;
  var STYLE_LITERAL = 3;
  var STYLE_FOLDED = 4;
  var STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) return STYLE_DOUBLE;
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) return STYLE_DOUBLE;
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) return STYLE_PLAIN;
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) return STYLE_DOUBLE;
    if (!forceQuotes) return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = (function() {
      if (string.length === 0) return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
      const indent = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      const singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string, lineWidth) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    })();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === "\n";
    return indentIndicator + (clip && (string[string.length - 2] === "\n" || string === "\n") ? "+" : clip ? "" : "-") + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result2 = (function() {
      let nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    })();
    let prevMoreIndented = string[0] === "\n" || string[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string)) {
      const prefix = match[1];
      const line = match[2];
      moreIndented = line[0] === " ";
      result2 += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result2;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    const breakRe = / [^ ]/g;
    let match;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result2 = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result2 += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result2 += "\n";
    if (line.length - start > width && curr > start) result2 += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    else result2 += line.slice(start);
    return result2.slice(1);
  }
  function escapeString(string) {
    let result2 = "";
    let char = 0;
    for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result2 += string[i];
        if (char >= 65536) result2 += string[i + 1];
      } else result2 += escapeSeq || encodeHex(char);
    }
    return result2;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) value = state.replacer.call(object, String(index), value);
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) value = state.replacer.call(object, String(index), value);
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") _result += generateNextLine(state, level);
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) _result += "-";
        else _result += "- ";
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
      if (!writeNode(state, level, objectKey, false, false)) continue;
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) continue;
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) objectKeyList.sort();
    else if (typeof state.sortKeys === "function") objectKeyList.sort(state.sortKeys);
    else if (state.sortKeys) throw new YAMLException2("sortKeys must be a boolean or a function");
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") pairBuffer += generateNextLine(state, level);
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
      if (!writeNode(state, level + 1, objectKey, true, true, true)) continue;
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += "?";
      else pairBuffer += "? ";
      pairBuffer += state.dump;
      if (explicitPair) pairBuffer += generateNextLine(state, level);
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) continue;
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += ":";
      else pairBuffer += ": ";
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type = typeList[index];
      if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === "object" && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
        if (explicit) if (type.multi && type.representName) state.tag = type.representName(object);
        else state.tag = type.tag;
        else state.tag = "?";
        if (type.represent) {
          const style = state.styleMap[type.tag] || type.defaultStyle;
          let _result;
          if (_toString.call(type.represent) === "[object Function]") _result = type.represent(object, style);
          else if (_hasOwnProperty.call(type.represent, style)) _result = type.represent[style](object, style);
          else throw new YAMLException2("!<" + type.tag + '> tag resolver accepts not "' + style + '" style');
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) detectType(state, object, true);
    const type = _toString.call(state.dump);
    const inblock = block;
    if (block) block = state.flowLevel < 0 || state.flowLevel > level;
    const objectOrArray = type === "[object Object]" || type === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) compact = false;
    if (duplicate && state.usedDuplicates[duplicateIndex]) state.dump = "*ref_" + duplicateIndex;
    else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) state.usedDuplicates[duplicateIndex] = true;
      if (type === "[object Object]") if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
      }
      else if (type === "[object Array]") if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) writeBlockSequence(state, level - 1, state.dump, compact);
        else writeBlockSequence(state, level, state.dump, compact);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
      }
      else if (type === "[object String]") {
        if (state.tag !== "?") writeScalar(state, state.dump, level, iskey, inblock);
      } else if (type === "[object Undefined]") return false;
      else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(state.tag[0] === "!" ? state.tag.slice(1) : state.tag).replace(/!/g, "%21");
        if (state.tag[0] === "!") tagStr = "!" + tagStr;
        else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") tagStr = "!!" + tagStr.slice(18);
        else tagStr = "!<" + tagStr + ">";
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) state.duplicates.push(objects[duplicatesIndexes[index]]);
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) duplicatesIndexes.push(index);
      } else {
        objects.push(object);
        if (Array.isArray(object)) for (let i = 0, length = object.length; i < length; i += 1) inspectNode(object[i], objects, duplicatesIndexes);
        else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) value = state.replacer.call({ "": value }, "", value);
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  module.exports.dump = dump2;
}));
var import_js_yaml = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
  var loader = require_loader();
  var dumper = require_dumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  module.exports.Type = require_type();
  module.exports.Schema = require_schema();
  module.exports.FAILSAFE_SCHEMA = require_failsafe();
  module.exports.JSON_SCHEMA = require_json();
  module.exports.CORE_SCHEMA = require_core();
  module.exports.DEFAULT_SCHEMA = require_default();
  module.exports.load = loader.load;
  module.exports.loadAll = loader.loadAll;
  module.exports.dump = dumper.dump;
  module.exports.YAMLException = require_exception();
  module.exports.types = {
    binary: require_binary(),
    float: require_float(),
    map: require_map(),
    null: require_null(),
    pairs: require_pairs(),
    set: require_set(),
    timestamp: require_timestamp(),
    bool: require_bool(),
    int: require_int(),
    merge: require_merge(),
    omap: require_omap(),
    seq: require_seq(),
    str: require_str()
  };
  module.exports.safeLoad = renamed("safeLoad", "load");
  module.exports.safeLoadAll = renamed("safeLoadAll", "loadAll");
  module.exports.safeDump = renamed("safeDump", "dump");
})))(), 1);
var { Type, Schema, FAILSAFE_SCHEMA, JSON_SCHEMA, CORE_SCHEMA, DEFAULT_SCHEMA, load, loadAll, dump, YAMLException, types, safeLoad, safeLoadAll, safeDump } = import_js_yaml.default;
var index_vite_proxy_tmp_default = import_js_yaml.default;

// src/opengym/client.mjs
import net from "node:net";
var RemoteError = class extends Error {
  constructor(code, retryAt) {
    super(code);
    this.code = code;
    this.retryAt = retryAt;
  }
};
function endpoint(config) {
  const url = new URL(config.endpoint);
  if (url.username || url.password || url.search || url.hash) throw new Error("Invalid endpoint");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ip = net.isIP(host);
  const privateHost = host === "localhost" || host === "::1" || ip === 4 && (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && config.trustedPrivateHttp === true && privateHost)) throw new Error("Endpoint requires HTTPS or explicitly trusted private HTTP");
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  return url;
}
var Client = class {
  constructor(config) {
    this.base = endpoint(config);
    this.token = process.env[config.tokenEnv || "OPENGYM_TOKEN"];
    if (!this.token) throw new Error("Missing token environment variable");
    this.id = 0;
  }
  async request(path4, options = {}) {
    let response;
    try {
      response = await fetch(new URL(path4, this.base), { ...options, redirect: "manual", signal: AbortSignal.timeout(15e3), headers: { authorization: `Bearer ${this.token}`, ...options.headers } });
    } catch {
      throw new RemoteError("network_uncertain");
    }
    if (response.status === 429) {
      const value = response.headers.get("retry-after");
      const seconds = value === null || value.trim() === "" ? NaN : Number(value);
      const parsed = value && !Number.isFinite(seconds) ? Date.parse(value) : NaN;
      throw new RemoteError("rate_limited", new Date(Number.isFinite(parsed) ? parsed : Date.now() + (Number.isFinite(seconds) && seconds >= 0 ? seconds : 60) * 1e3).toISOString());
    }
    if (!response.ok) throw new RemoteError(`http_${response.status}`);
    if (response.status === 204 || response.status === 202) return null;
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new RemoteError("invalid_content_type");
    try {
      return await response.json();
    } catch {
      throw new RemoteError("invalid_json");
    }
  }
  async identity() {
    return this.request("api/token/me");
  }
  async rpc(method, params, notification = false) {
    const id = ++this.id;
    const body = { jsonrpc: "2.0", method, ...params ? { params } : {}, ...!notification ? { id } : {} };
    let result2;
    try {
      result2 = await this.request("mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...this.protocol ? { "mcp-protocol-version": this.protocol } : {} }, body: JSON.stringify(body) });
    } catch (error) {
      if (notification && error.code === "invalid_content_type") return;
      throw error;
    }
    if (notification) return;
    if (result2.jsonrpc !== "2.0" || result2.id !== id || result2.error || !result2.result) throw new RemoteError("rpc_error");
    return result2.result;
  }
  async initialize() {
    const result2 = await this.rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "workout-opengym", version: "1.0.0" } });
    if (typeof result2.protocolVersion !== "string") throw new RemoteError("invalid_protocol");
    this.protocol = result2.protocolVersion;
    await this.rpc("notifications/initialized", null, true);
    const list = await this.rpc("tools/list");
    if (!Array.isArray(list.tools) || list.tools.some((tool) => typeof tool.name !== "string" || !tool.inputSchema || tool.inputSchema.type !== "object" || tool.inputSchema.properties != null && (typeof tool.inputSchema.properties !== "object" || Array.isArray(tool.inputSchema.properties)))) throw new RemoteError("invalid_tools");
    return list.tools;
  }
  async call(name, args = {}) {
    const result2 = await this.rpc("tools/call", { name, arguments: args });
    if (result2.isError) {
      const text = result2.content?.length === 1 && result2.content[0]?.type === "text" ? result2.content[0].text : "";
      if (typeof text === "string" && text.startsWith("ERATE: ")) {
        const seconds = result2.retryAfter;
        throw new RemoteError("native_rate_limited", new Date(Date.now() + (Number.isFinite(seconds) && seconds >= 0 ? seconds * 1e3 : 36e5)).toISOString());
      }
      throw new RemoteError("tool_error");
    }
    const texts = result2.content?.filter((item) => item.type === "text");
    if (texts?.length !== 1) throw new RemoteError("invalid_tool_content");
    try {
      const data = JSON.parse(texts[0].text);
      if (!data || typeof data !== "object") throw 0;
      return data;
    } catch {
      throw new RemoteError("invalid_tool_content");
    }
  }
};

// src/opengym/publication.mjs
var ok = (state, data, warnings = []) => ({ ok: true, state, data, warnings });
var keys = (o, allowed) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).every((k) => allowed.includes(k));
var clone = (value) => JSON.parse(JSON.stringify(value));
var comparable = (routine) => {
  const copy = clone(routine);
  delete copy.revision;
  return copy;
};
var same = (a, b) => hash(a) === hash(b);
function parse(input) {
  if (!keys(input, ["templateId", "revision", "payload", "approval", "rebase"])) throw new Error("Unsupported publication field or coaching policy");
  if (typeof input.templateId !== "string" || !input.templateId.trim() || typeof input.revision !== "string" || !input.revision.trim()) throw new Error("Publication requires stable templateId and revision strings");
  if (input.rebase !== void 0 && input.rebase !== true) throw new Error("rebase must be true when supplied");
  const p = input.payload;
  if (!keys(p, ["name", "exercises", "unit", "weekdays"])) throw new Error("Unsupported routine field or progression policy");
  if (typeof p.name !== "string" || !p.name.trim() || !["kg", "lb"].includes(p.unit) || !Array.isArray(p.exercises) || !p.exercises.length) throw new Error("Routine requires name, unit and exercises");
  for (const e of p.exercises) {
    if (!keys(e, ["exercise", "sets", "reps", "seconds", "weight", "rest_sec", "note"])) throw new Error("Unsupported exercise field: ranges, per-side, supersets, RIR and progression require manual handling");
    if (typeof e.exercise !== "string" || !e.exercise.trim() || !Number.isInteger(e.sets) || e.sets < 1 || "reps" in e === "seconds" in e || !Number.isInteger(e.reps ?? e.seconds) || (e.reps ?? e.seconds) < 1 || !Number.isFinite(e.weight) || e.weight <= 0) throw new Error("Each exercise requires an explicit ID, sets, fixed reps or seconds, and positive fixed weight; zero and omitted loads use openGym defaults");
  }
  return { templateId: input.templateId, revision: input.revision, payload: clone(p), rebase: input.rebase === true };
}
function matches(routine, payload, readback = false) {
  return routine?.name === payload.name && routine.unit === payload.unit && Array.isArray(routine.exercises) && routine.exercises.length === payload.exercises.length && payload.exercises.every((e, i) => {
    const r = routine.exercises[i];
    return r.id === e.exercise && r.sets === e.sets && (e.reps === void 0 || r.reps === e.reps) && (e.seconds === void 0 || r.seconds === e.seconds || r.sec === e.seconds) && r.weight === e.weight && (e.rest_sec === void 0 || (e.rest_sec === 0 ? r.rest_sec == null : r.rest_sec === e.rest_sec)) && (!readback || e.note === void 0 || routine._publication?.routine?.ex?.[i]?.note === e.note);
  }) && (!readback || payload.weekdays === void 0 || same([...payload.weekdays].sort(), routine._publication?.weekdays));
}
function effective(preview, payload, id) {
  return preview?.routine_id === id && Array.isArray(preview.exercises) && preview.exercises.length === payload.exercises.length && payload.exercises.every((e, i) => {
    const ex = preview.exercises[i], rows = ex?.opening_sets?.filter((row) => row.phase === "work");
    return ex?.id === e.exercise && rows?.length === e.sets && rows.every((row) => row.w === e.weight && (e.reps === void 0 || row.r === e.reps) && (e.seconds === void 0 || row.sec === e.seconds));
  });
}
function baseFor(state, programKey, templateId) {
  return state.routineBases?.[programKey]?.[templateId] || null;
}
function putBase(state, programKey, templateId, base) {
  state.routineBases ||= {};
  state.routineBases[programKey] ||= {};
  state.routineBases[programKey][templateId] = base;
}
async function captureRoutine(client, id) {
  const detail = await client.call("get_routine", { routine_id: id });
  if (detail?.id !== id || !Array.isArray(detail.exercises) || !Number.isInteger(detail.revision)) throw new Error("Invalid routine readback");
  const snapshot = await client.request("api/token/data");
  const raw = snapshot?.state?.routines?.find((r) => r.id === id);
  if (!raw || snapshot.rev !== detail.revision || !snapshot.state.week || typeof snapshot.state.week !== "object") throw new Error("Scoped routine snapshot unavailable or changed");
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdays = names.filter((_, i) => Array.isArray(snapshot.state.week[i]) && snapshot.state.week[i].includes(id)).sort();
  return { ...detail, _publication: { routine: raw, weekdays } };
}
async function current(client, id) {
  if (!id) return null;
  const list = await client.call("list_routines", {});
  if (!Array.isArray(list.routines)) throw new Error("Invalid routine list");
  if (!list.routines.some((r) => r.id === id)) return null;
  return captureRoutine(client, id);
}
function result(job) {
  return ok(job.state, { id: job.id, routineId: job.routineId || null, retryAt: job.retryAt || null, reason: job.reason || null });
}
function approved(job, fingerprint) {
  return hash({ id: job.id, fingerprint, preview: job.preview, remote: job.remote, base: job.base, mapping: job.mapping, rebase: job.rebase });
}
function prescriptionFingerprint(payload) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, k === "weekdays" && Array.isArray(value[k]) ? [...value[k]].sort() : canonical(value[k])])) : value;
  return hash(canonical(payload));
}
async function publish(client, state, save, context, input, dryRun) {
  const desired = parse(input);
  const { need, fingerprint, programKey, schemas, schemaAccepts: schemaAccepts2 } = context;
  need("list_routines", "get_routine", "preview_session", "create_routine", "update_routine");
  const versionJobs = state.jobs.filter((j) => j.kind === "publish" && j.programKey === programKey && j.templateId === desired.templateId && j.revision === desired.revision);
  const fingerprints = new Set(versionJobs.filter((j) => j.payload).map((j) => prescriptionFingerprint(j.payload)));
  const published = (state.publications || []).filter((p) => p.programKey === programKey && p.templateId === desired.templateId && p.revision === desired.revision);
  if (fingerprints.size > 1 || published.length > 1 || fingerprints.size && !fingerprints.has(prescriptionFingerprint(desired.payload)) || published.length && !fingerprints.size) return ok("needs_review", { reason: "Prescription revision is immutable or its history is inconsistent; use a new revision or reconcile the existing history" });
  const matching = versionJobs.filter((j) => j.payload && prescriptionFingerprint(j.payload) === prescriptionFingerprint(desired.payload));
  let job = [...matching].reverse().find((j) => j.rebase === desired.rebase) || [...matching].reverse().find((j) => j.state === "verified");
  let id = job?.id || hash({ kind: "publish", programKey, ...desired, payload: prescriptionFingerprint(desired.payload) });
  if (job && job.state === "verified") {
    const existing = await current(client, job.routineId);
    const base2 = baseFor(state, programKey, desired.templateId);
    if (!existing || !base2 || base2.id !== job.routineId || !same(comparable(existing), comparable(base2.snapshot))) {
      if (!desired.rebase || !existing || !base2 || base2.id !== job.routineId) return ok("conflict", { reason: "Verified routine was deleted or edited remotely", base: base2?.snapshot || null, remote: existing });
      job = null;
      id = hash({ kind: "publish", programKey, ...desired, payload: prescriptionFingerprint(desired.payload), remote: existing });
    }
    if (job && job.fingerprint !== fingerprint) return ok("needs_review", { reason: "Capabilities or scope changed since publication" });
    if (job) {
      const opened = await client.call("preview_session", { routine_id: job.routineId });
      if (!matches(existing, desired.payload, true) || !effective(opened, desired.payload, job.routineId)) return ok("needs_review", { reason: "Current effective targets differ from the local prescription" });
      return result(job);
    }
  }
  if (job && ["uncertain", "acknowledged"].includes(job.state) && job.acknowledged) await reconcilePublication(client, state, job, save, context);
  if (job && (["uncertain", "acknowledged", "retry_at", "dispatched", "verified"].includes(job.state) || job.state === "needs_review" && job.routineId)) return result(job);
  const mapping = state.mappings?.[programKey]?.[desired.templateId] || null;
  const base = baseFor(state, programKey, desired.templateId);
  if (mapping && (!base || base.id !== mapping)) return ok("needs_review", { reason: "Mapped routine has no explicitly reviewed baseline; adopt it again first" });
  if (!mapping && state.jobs.some((j) => j.kind === "publish" && j.programKey === programKey && j.templateId === desired.templateId && (["uncertain", "acknowledged", "dispatched"].includes(j.state) || j.state === "needs_review" && j.routineId))) return ok("uncertain", { reason: "An earlier create has an unknown outcome; do not recreate it" });
  const remote = await current(client, mapping);
  if (mapping && !remote) return ok("conflict", { reason: "Mapped routine was deleted remotely; it will not be recreated", base });
  if (mapping && !same(comparable(base.snapshot), comparable(remote)) && !desired.rebase) return ok("conflict", { reason: "Phone changes require an explicit reviewed rebase", base: base.snapshot, remote, desired: desired.payload });
  if (desired.rebase && !mapping) throw new Error("Rebase requires an adopted or previously published routine");
  const tool = mapping ? "update_routine" : "create_routine";
  const args = mapping ? { routine_id: mapping, ...desired.payload, expected_revision: remote.revision, dry_run: true } : { ...desired.payload, dry_run: true };
  if (!schemaAccepts2(schemas[tool], args)) throw new Error("Native routine schema rejects this publication");
  const preview = await client.call(tool, args);
  if (preview.saved !== false || preview.dry_run !== true || preview.problems || !preview.would_save?.routine || !matches(preview.would_save.routine, desired.payload) || desired.payload.weekdays !== void 0 && !same([...desired.payload.weekdays].sort(), [...preview.would_save.routine.weekdays || []].sort())) return ok("needs_review", { reason: "Native routine preview differs from the requested fixed targets", preview });
  const stablePreview = clone(preview);
  if (!mapping) delete stablePreview.would_save.routine.id;
  if (!job || job.state !== "draft" || !same(job.remote, remote) || !same(job.base, base) || job.fingerprint !== fingerprint || !same(job.preview, stablePreview)) {
    job = { id, kind: "publish", state: "draft", programKey, ...desired, mapping, base, remote, preview: stablePreview, fingerprint, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    job.approval = approved(job, fingerprint);
    state.jobs = state.jobs.filter((j) => j.id !== id);
    state.jobs.push(job);
    await save();
  }
  if (dryRun) return ok("review", { id, approval: job.approval, preview: job.preview, base: base?.snapshot || null, remote, desired: desired.payload, coverage: "Fixed targets only; openGym progression and future session values are not controlled." });
  if (input.approval !== job.approval) return ok("needs_review", { reason: "Approval is missing or stale; review the current preview", approval: job.approval });
  await dispatchPublication(client, state, job, save, context);
  return result(job);
}
async function dispatchPublication(client, state, job, save, context) {
  const { need, fingerprint, programKey, schemas, schemaAccepts: schemaAccepts2 } = context;
  if (!await context.allowMutation(job, save)) return;
  need("list_routines", "get_routine", "preview_session", "create_routine", "update_routine");
  const mapping = state.mappings?.[programKey]?.[job.templateId] || null, base = baseFor(state, programKey, job.templateId);
  const siblings = state.jobs.filter((j) => j !== job && j.kind === "publish" && j.programKey === programKey && j.templateId === job.templateId);
  const unresolvedCreate = siblings.some((j) => !j.mapping && (["uncertain", "dispatched", "acknowledged"].includes(j.state) || j.state === "needs_review" && j.routineId));
  if (!mapping && unresolvedCreate) {
    job.state = "needs_review";
    job.reason = "Another create has an unresolved outcome; reconcile or adopt its identity";
    delete job.retryAt;
    await save();
    return;
  }
  const versionFingerprints = new Set(state.jobs.filter((j) => j.kind === "publish" && j.programKey === programKey && j.templateId === job.templateId && j.revision === job.revision && j.payload).map((j) => prescriptionFingerprint(j.payload)));
  if (versionFingerprints.size !== 1 || !versionFingerprints.has(prescriptionFingerprint(job.payload))) {
    job.state = "needs_review";
    job.reason = "Prescription revision history is inconsistent";
    await save();
    return;
  }
  if (job.programKey !== programKey || job.fingerprint !== fingerprint || job.approval !== approved(job, fingerprint) || !same(mapping, job.mapping) || !same(base, job.base)) {
    job.state = "needs_review";
    job.reason = "Approval, scope, mapping or baseline changed";
    await save();
    return;
  }
  const remote = await current(client, mapping);
  if (!same(remote, job.remote)) {
    job.state = "conflict";
    job.reason = "Remote routine or revision changed since review";
    await save();
    return;
  }
  const tool = mapping ? "update_routine" : "create_routine";
  const args = mapping ? { routine_id: mapping, ...job.payload, expected_revision: remote.revision } : { ...job.payload };
  if (!schemaAccepts2(schemas[tool], { ...args, dry_run: false })) {
    job.state = "needs_review";
    job.reason = "Native schema changed";
    await save();
    return;
  }
  const preview = await client.call(tool, { ...args, dry_run: true });
  if (preview.saved !== false || preview.dry_run !== true || preview.problems || !preview.would_save?.routine || !matches(preview.would_save.routine, job.payload)) {
    job.state = "needs_review";
    job.reason = "Fresh native preview differs";
    await save();
    return;
  }
  const normalized = clone(preview);
  if (!mapping) delete normalized.would_save.routine.id;
  if (!same(normalized, job.preview)) {
    job.state = "needs_review";
    job.reason = "Native preview changed";
    await save();
    return;
  }
  const now = Date.now();
  state.writeTimes = (state.writeTimes || []).filter((time) => now - time < 36e5);
  if (state.writeTimes.length >= 20) {
    job.state = "retry_at";
    job.retryAt = new Date(state.writeTimes[0] + 36e5).toISOString();
    job.reason = "local_write_budget";
    await save();
    return;
  }
  state.writeTimes.push(now);
  job.state = "dispatched";
  delete job.retryAt;
  await save();
  let response;
  try {
    response = await client.call(tool, { ...args, dry_run: false });
  } catch (error) {
    job.state = ["rate_limited", "native_rate_limited"].includes(error.code) && error.retryAt ? "retry_at" : "uncertain";
    job.retryAt = error.retryAt;
    job.reason = error.code || "lost_response";
    await save();
    return;
  }
  if (response.saved !== true || typeof response.routine?.id !== "string" || !response.routine.id || mapping && response.routine.id !== mapping) {
    job.state = response.conflict ? "conflict" : response.problems ? "needs_review" : "uncertain";
    job.reason = response.message || "Save was not acknowledged";
    await save();
    return;
  }
  job.routineId = response.routine.id;
  job.state = "acknowledged";
  job.acknowledged = true;
  await save();
  await reconcilePublication(client, state, job, save, context);
}
async function reconcilePublication(client, state, job, save, context) {
  if (!job.acknowledged || !job.routineId || job.programKey !== context.programKey) return;
  const { programKey } = context;
  const mapping = state.mappings?.[programKey]?.[job.templateId] || null;
  if (mapping && mapping !== job.routineId || !same(baseFor(state, programKey, job.templateId), job.base) || job.fingerprint !== context.fingerprint) {
    job.state = "needs_review";
    job.reason = "Routine mapping, baseline or capability changed during readback";
    await save();
    return;
  }
  try {
    const detail = await current(client, job.routineId);
    const opened = await client.call("preview_session", { routine_id: job.routineId });
    if (!matches(detail, job.payload, true) || !effective(opened, job.payload, job.routineId)) {
      job.state = "needs_review";
      job.reason = "Saved routine or effective opening targets differ; inspect openGym progression";
      await save();
      return;
    }
    state.publications ||= [];
    const prior = state.publications.filter((p) => p.programKey === programKey && p.templateId === job.templateId && p.revision === job.revision);
    if (prior.length > 1) {
      job.state = "needs_review";
      job.reason = "Prescription revision history is inconsistent";
      await save();
      return;
    }
    state.mappings ||= {};
    state.mappings[programKey] ||= {};
    state.mappings[programKey][job.templateId] = job.routineId;
    putBase(state, programKey, job.templateId, { id: job.routineId, snapshot: detail });
    if (!prior.length) state.publications.push({ templateId: job.templateId, revision: job.revision, programKey, routineId: job.routineId, prescription: clone(job.payload), snapshot: detail, effective: opened, verifiedAt: (/* @__PURE__ */ new Date()).toISOString() });
    else {
      state.verificationEvents ||= [];
      state.verificationEvents.push({ programKey, templateId: job.templateId, revision: job.revision, routineId: job.routineId, verifiedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    job.state = "verified";
    job.reason = null;
    await save();
  } catch {
    job.state = "uncertain";
    job.reason = "Acknowledged save could not be verified";
    await save();
  }
}
function rememberAdoptedBases(state, programKey, templates, details) {
  for (const [templateId, id] of Object.entries(templates)) putBase(state, programKey, templateId, { id, snapshot: details[id] });
}

// src/opengym/engine.mjs
var required = (value, name) => {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
var ok2 = (state, data, warnings) => ({ ok: true, state, ...data === void 0 ? {} : { data }, ...warnings?.length ? { warnings } : {} });
var capabilities = ["list_workouts", "get_workout", "list_routines", "get_routine", "preview_session", "log_workout", "create_routine", "update_routine"];
function programDir(options) {
  if (!options.workspace || !options.program || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.program) || options.program === "..") throw new Error("A workspace and valid program are required");
  const workspace = realpathSync(options.workspace);
  const programs = realpathSync(path2.join(workspace, "programs"));
  const directory = realpathSync(path2.join(programs, options.program));
  const within = (parent, child) => child.startsWith(parent + path2.sep);
  if (!within(workspace, programs) || !within(programs, directory)) throw new Error("Program directory escapes workspace");
  for (const file of [".opengym-backend.json", ".opengym-projection.json"]) {
    try {
      if (lstatSync(path2.join(directory, file)).isSymbolicLink()) throw new Error("Program sidecar cannot be a symlink");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return directory;
}
function validateActual(input) {
  required(input?.occurrenceId, "occurrenceId");
  required(input?.sessionId, "sessionId");
  const payload = required(input?.payload, "payload");
  if (!/^\d{4}-\d\d-\d\d$/.test(payload.date || "") || !Number.isFinite(Date.parse(payload.date)) || new Date(payload.date).toISOString().slice(0, 10) !== payload.date || typeof input.timezone !== "string" || !["kg", "lb"].includes(payload.unit) || !Array.isArray(payload.exercises) || !payload.exercises.length || payload.exercises.length > 40) throw new Error("Actuals require date, timezone, unit and exercises");
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw new Error("Invalid timezone");
  }
  if (Object.keys(payload).some((key) => !["date", "start", "duration_min", "name", "unit", "note", "exercises"].includes(key))) throw new Error("Unsupported workout field; use duration_min and note");
  if (payload.start != null && (typeof payload.start !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.start))) throw new Error("Invalid workout start; use HH:MM");
  if (payload.duration_min != null && (!Number.isFinite(payload.duration_min) || payload.duration_min < 1 || payload.duration_min > 1440)) throw new Error("Invalid workout duration_min");
  for (const [field, max] of [["name", 80], ["note", 500]]) if (payload[field] != null && (typeof payload[field] !== "string" || payload[field] !== payload[field].trim() || !payload[field] || payload[field].length > max)) throw new Error("Invalid workout " + field);
  for (const exercise of payload.exercises) {
    if (!exercise || Object.keys(exercise).some((key) => !["exercise", "sets"].includes(key)) || typeof exercise.exercise !== "string" || !exercise.exercise || exercise.exercise.length > 120 || !Array.isArray(exercise.sets) || !exercise.sets.length || exercise.sets.length > 50) throw new Error("Explicit exercise IDs and sets are required");
    const kinds = /* @__PURE__ */ new Set();
    for (const set of exercise.sets) {
      if (!set || typeof set !== "object" || Array.isArray(set) || Object.keys(set).some((key) => !["reps", "weight", "seconds", "rir", "rpe"].includes(key))) throw new Error("Unsupported actual set field; use seconds for holds");
      if (set.reps == null === (set.seconds == null)) throw new Error("Each set needs either reps or seconds");
      kinds.add(set.reps == null ? "seconds" : "reps");
      if (set.reps != null && (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 1e3)) throw new Error("Invalid reps");
      if (set.seconds != null && (!Number.isInteger(set.seconds) || set.seconds < 1 || set.seconds > 21600)) throw new Error("Invalid seconds");
      if (!Number.isFinite(set.weight) || set.weight < 0) throw new Error("Specify weight explicitly, including 0 for bodyweight; unknown weight cannot be preserved");
      if (set.rir != null && (!Number.isFinite(set.rir) || set.rir < 0 || set.rir > 10) || set.rpe != null && (!Number.isFinite(set.rpe) || set.rpe < 6 || set.rpe > 10) || set.rir != null && set.rpe != null || set.seconds != null && (set.rir != null || set.rpe != null)) throw new Error("Invalid effort; use RIR or RPE on rep sets");
    }
    if (kinds.size !== 1) throw new Error("Each exercise must use reps or seconds consistently");
  }
  return structuredClone(payload);
}
async function history(client, from, to, state = null, save = async () => {
}) {
  const key = hash({ from, to });
  const scan = state?.historyScan?.key === key ? state.historyScan : {
    key,
    pending: [{ type: "range", from, to }],
    observations: [],
    complete: true
  };
  if (state) {
    state.historyScan = scan;
    await save();
  }
  while (scan.pending.length) {
    const item = scan.pending[0];
    try {
      if (item.type === "detail") {
        const detail = await client.call("get_workout", { workout_id: item.id });
        if (detail?.id !== item.id || detail.ambiguous || !Array.isArray(detail.entries || detail.exercises)) throw new Error("Invalid workout detail");
        scan.observations.push(detail);
        if (state) state.workouts[item.id] = detail;
        scan.pending.shift();
      } else {
        const result2 = await client.call("list_workouts", { from: item.from, to: item.to, limit: 200 });
        if (!Array.isArray(result2.workouts) || !Number.isInteger(result2.matching_count) || typeof result2.truncated !== "boolean" || !Number.isInteger(result2.returned_count) || result2.returned_count !== result2.workouts.length) throw new Error("Invalid workout coverage response");
        if (item.type === "confirm") {
          if (hash(result2) !== item.fingerprint) scan.complete = false;
          scan.pending.shift();
        } else if (result2.truncated || result2.matching_count > result2.workouts.length) {
          scan.pending.shift();
          if (item.from === item.to) scan.complete = false;
          else {
            const a = Date.parse(item.from + "T00:00:00Z"), b = Date.parse(item.to + "T00:00:00Z");
            const middle = Math.floor((a + b) / 1728e5) * 864e5;
            scan.pending.unshift({ type: "range", from: item.from, to: new Date(middle).toISOString().slice(0, 10) }, { type: "range", from: new Date(middle + 864e5).toISOString().slice(0, 10), to: item.to });
          }
        } else {
          scan.pending.shift();
          const details = [];
          for (const workout of result2.workouts) {
            if (!workout.id) scan.observations.push({ ...workout, unresolved: true });
            else details.push({ type: "detail", id: workout.id });
          }
          scan.pending.unshift(...details, ...state ? [{ type: "confirm", from: item.from, to: item.to, fingerprint: hash(result2) }] : []);
        }
      }
      if (state) await save();
    } catch (error) {
      if (state && error.code === "local_quota") {
        await save();
        return { complete: false, observations: scan.observations, pending: scan.pending.length };
      }
      throw error;
    }
  }
  if (state) {
    delete state.historyScan;
    await save();
  }
  return { complete: scan.complete, observations: scan.observations };
}
function projection(state, from, to, complete, observedAt, programKey, program, requiresAdoption = false) {
  const currentMesocycle = state.assignmentContexts?.[programKey]?.currentMesocycle ?? null;
  state = { ...state, assignments: state.assignments.filter((a) => a.programKey === programKey) };
  const currentIds = new Set(state.observation?.observedIds || []);
  const linked = state.assignments.filter((a) => a.workoutId && currentIds.has(a.workoutId) && state.workouts[a.workoutId] && a.verified === true && typeof state.workouts[a.workoutId].date === "string" && Number.isFinite(Date.parse(state.workouts[a.workoutId].date))).map((a) => ({ occurrenceId: a.occurrenceId, sessionId: a.sessionId, workoutId: a.workoutId, completedAt: state.workouts[a.workoutId].date, templateId: a.templateId ?? null, templateRevision: a.templateRevision ?? null, versionContext: a.templateId && a.templateRevision ? "known" : "unknown" }));
  const ordered = linked.filter((a) => Number.isInteger(state.assignments.find((x) => x.occurrenceId === a.occurrenceId)?.order)).sort((a, b) => state.assignments.find((x) => x.occurrenceId === a.occurrenceId).order - state.assignments.find((x) => x.occurrenceId === b.occurrenceId).order);
  const last = ordered.at(-1) || null;
  const lastOrder = last && state.assignments.find((x) => x.occurrenceId === last.occurrenceId).order;
  const orderCounts = /* @__PURE__ */ new Map();
  for (const assignment of state.assignments) if (Number.isInteger(assignment.order)) orderCounts.set(assignment.order, (orderCounts.get(assignment.order) || 0) + 1);
  const ambiguous = state.assignments.some((a) => !Number.isInteger(a.order) || !a.sessionId || a.workoutId && !linked.some((x) => x.occurrenceId === a.occurrenceId)) || [...orderCounts.values()].some((count) => count > 1);
  const firstOrder = Math.min(...orderCounts.keys());
  const nextCandidates = state.assignments.filter((x) => x.order === (last ? lastOrder + 1 : firstOrder));
  const next = !ambiguous && nextCandidates.length === 1 ? nextCandidates[0] : null;
  return { version: 2, scope: state.scope, program, requiresAdoption, currentMesocycle, observedAt, freshnessMaxAgeMs: 864e5, coverage: { from, to, complete }, activeUnknown: true, assignments: linked, lastSession: last, nextSessionId: next?.sessionId || null, needs_mapping: !next };
}
function schemaAccepts(schema, value) {
  if (!schema || typeof schema !== "object") return false;
  if (schema.type === "object") return value && typeof value === "object" && !Array.isArray(value) && (schema.required || []).every((key) => Object.hasOwn(value, key)) && Object.entries(value).every(([key, item]) => schemaAccepts(schema.properties?.[key], item));
  if (schema.type === "array") return Array.isArray(value) && (schema.minItems == null || value.length >= schema.minItems) && (schema.maxItems == null || value.length <= schema.maxItems) && value.every((item) => schemaAccepts(schema.items, item));
  if (schema.type === "string") return typeof value === "string" && (schema.minLength == null || value.length >= schema.minLength) && (schema.maxLength == null || value.length <= schema.maxLength) && (!schema.pattern || new RegExp(schema.pattern).test(value)) && (!schema.enum || schema.enum.includes(value));
  if (schema.type === "number" || schema.type === "integer") return Number.isFinite(value) && (schema.type !== "integer" || Number.isInteger(value)) && (schema.minimum == null || value >= schema.minimum) && (schema.maximum == null || value <= schema.maximum);
  if (schema.type === "boolean") return typeof value === "boolean";
  return false;
}
function matchesPreview(view, payload) {
  if (!view || view.date !== payload.date || view.unit !== payload.unit || payload.start != null && view.start !== payload.start || payload.name != null && view.name !== payload.name || payload.note != null && view.note !== payload.note || !Array.isArray(view.exercises) || view.exercises.length !== payload.exercises.length) return false;
  return payload.exercises.every((e, i) => {
    const found = view.exercises[i];
    return found?.id === e.exercise && Array.isArray(found.sets) && found.sets.length === e.sets.length && e.sets.every((set, j) => Object.entries(set).every(([k, v]) => found.sets[j]?.[k] === v));
  });
}
function matchesWorkout(detail, payload, id) {
  if (!detail || detail.ambiguous || detail.id !== id || detail.date !== payload.date || detail.unit !== payload.unit) return false;
  if (payload.name != null && detail.routine_name !== payload.name) return false;
  const entries = detail.entries;
  if (!Array.isArray(entries) || entries.length !== payload.exercises.length) return false;
  return payload.exercises.every((expected, i) => {
    const entry = entries[i];
    if (entry?.id !== expected.exercise || !Array.isArray(entry.sets) || entry.sets.length !== expected.sets.length) return false;
    return expected.sets.every((set, j) => {
      const actual = entry.sets[j];
      return actual?.w === set.weight && (set.reps == null || actual.r === set.reps) && (set.seconds == null || actual.sec === set.seconds);
    });
  });
}
async function verifyJob(client, state, job) {
  const detail = await client.call("get_workout", { workout_id: job.workoutId });
  if (!matchesWorkout(detail, job.payload, job.workoutId)) return false;
  const payload = job.payload;
  if (payload.start != null || payload.duration_min != null || payload.note != null || payload.exercises.some((e) => e.sets.some((s) => s.rir != null || s.rpe != null))) {
    const data = await client.request("api/token/data");
    if (!data || typeof data.rev !== "number" || !Array.isArray(data.state?.workouts)) return false;
    const raw = data.state.workouts.find((w) => w.id === job.workoutId);
    if (!raw || raw.d !== payload.date || !Array.isArray(raw.entries) || raw.entries.length !== payload.exercises.length) return false;
    if (payload.start != null) {
      if (!Number.isFinite(raw.start)) return false;
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: job.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(raw.start);
      const get = (name) => parts.find((p) => p.type === name)?.value;
      if (`${get("year")}-${get("month")}-${get("day")}` !== payload.date || `${get("hour")}:${get("minute")}` !== payload.start) return false;
    }
    if (payload.duration_min != null && (!Number.isFinite(raw.start) || !Number.isFinite(raw.end) || raw.end - raw.start !== payload.duration_min * 6e4)) return false;
    if (payload.note != null && raw.note !== payload.note) return false;
    if (!payload.exercises.every((e, i) => raw.entries[i]?.id === e.exercise && Array.isArray(raw.entries[i].sets) && raw.entries[i].sets.length === e.sets.length && e.sets.every((s, j) => ["rir", "rpe"].every((k) => s[k] == null || raw.entries[i].sets[j]?.[k] === s[k])))) return false;
  }
  const existing = state.assignments.find((a) => a.programKey === job.programKey && a.occurrenceId === job.occurrenceId && a.verified && a.workoutId);
  if (existing && existing.workoutId !== job.workoutId) return false;
  state.workouts[job.workoutId] = detail;
  const index = state.assignments.findIndex((a) => a.programKey === job.programKey && a.occurrenceId === job.occurrenceId);
  const assignment = { programKey: job.programKey, occurrenceId: job.occurrenceId, sessionId: job.sessionId, workoutId: job.workoutId, verified: true, completedAt: detail.date };
  if (index < 0) state.assignments.push(assignment);
  else state.assignments[index] = { ...state.assignments[index], ...assignment };
  job.state = "verified";
  return true;
}
async function dispatch(client, state, job, save, context) {
  if (!await context.allowMutation(job, save)) return;
  context.need("list_workouts", "get_workout", "log_workout");
  if (job.payload.start != null && (!context.serverTimezone || job.timezone !== context.serverTimezone)) {
    job.state = "needs_review";
    job.reason = "Server timezone changed since approval";
    delete job.retryAt;
    await save();
    return;
  }
  if (!schemaAccepts(context.logSchema, { ...job.payload, dry_run: false })) {
    job.state = "needs_review";
    await save();
    return;
  }
  const occurrence = state.assignments.find((a) => a.programKey === job.programKey && a.occurrenceId === job.occurrenceId);
  if (occurrence && (occurrence.sessionId !== job.sessionId || occurrence.verified && occurrence.workoutId) || job.programKey !== context.programKey || job.fingerprint !== context.fingerprint || job.approval !== hash({ id: job.id, preview: job.preview, fingerprint: context.fingerprint, ...job.reviewNonce ? { reviewNonce: job.reviewNonce } : {} })) {
    job.state = "needs_review";
    await save();
    return;
  }
  const currentPreview = await client.call("log_workout", { ...job.payload, dry_run: true });
  if (currentPreview.logged !== false || currentPreview.dry_run !== true || currentPreview.problems || currentPreview.duplicate || currentPreview.duplicate_of || !matchesPreview(currentPreview.would_log, job.payload)) {
    job.state = "needs_review";
    await save();
    return;
  }
  const current2 = await history(client, job.payload.date, job.payload.date);
  if (!current2.complete || current2.observations.length) {
    job.state = "needs_review";
    await save();
    return;
  }
  const now = Date.now();
  state.writeTimes = (state.writeTimes || []).filter((time) => now - time < 36e5);
  if (state.writeTimes.length >= 20) {
    job.state = "retry_at";
    job.retryReason = "local_write_budget";
    job.retryAt = new Date(state.writeTimes[0] + 36e5).toISOString();
    await save();
    return;
  }
  state.writeTimes.push(now);
  job.state = "dispatched";
  job.remoteEffect = "maybe";
  delete job.retryAt;
  delete job.retryReason;
  await save();
  let result2;
  try {
    result2 = await client.call("log_workout", { ...job.payload, dry_run: false });
  } catch (error) {
    job.state = ["rate_limited", "native_rate_limited"].includes(error.code) ? "retry_at" : "uncertain";
    if (job.state === "retry_at") {
      job.remoteEffect = "none";
      job.retryReason = error.code === "native_rate_limited" ? "upstream_tool_quota" : "upstream_http_quota";
    }
    if (error.retryAt) job.retryAt = error.retryAt;
    await save();
    return;
  }
  if (result2.logged !== true || typeof result2.workout_id !== "string" || !result2.workout_id) {
    if (result2.duplicate && typeof result2.workout_id === "string" && result2.workout_id) {
      job.workoutId = result2.workout_id;
      try {
        const detail = await client.call("get_workout", { workout_id: job.workoutId });
        if (matchesWorkout(detail, job.payload, job.workoutId)) state.workouts[job.workoutId] = detail;
      } catch {
      }
    }
    if (result2.logged === false && result2.problems && !result2.duplicate && !result2.duplicate_of) {
      job.remoteEffect = "none";
    }
    job.state = result2.duplicate || result2.duplicate_of || result2.problems ? "needs_review" : "uncertain";
    await save();
    return;
  }
  job.state = "acknowledged";
  job.remoteEffect = "confirmed";
  job.workoutId = result2.workout_id;
  await save();
  try {
    if (!await verifyJob(client, state, job)) job.state = "needs_review";
  } catch {
    job.state = "uncertain";
  }
  await save();
}
async function reconcile(client, state, job, save) {
  try {
    if (job.workoutId) {
      if (!await verifyJob(client, state, job)) job.state = "needs_review";
    } else {
      job.state = "needs_review";
    }
  } catch {
    job.state = "uncertain";
  }
  await save();
}
async function run(command, options, input, config, configPath) {
  const base = endpoint(config).href;
  if (typeof config.profileId !== "string" || !config.profileId) throw new Error("profileId must be a nonempty string");
  const expectedScope = { server: base, profileId: config.profileId };
  const programKey = options.workspace && options.program ? programDir(options) : null;
  const program = programKey ? { workspace: realpathSync(options.workspace), name: options.program } : null;
  let sidecar = options.workspace && options.program ? await readJson(path2.join(programDir(options), ".opengym-backend.json"), null) : null;
  if (["adopt", "log", "sync", "publish", "history"].includes(command) && !sidecar) throw new Error("Connect this program before using openGym");
  if (command === "publish" && sidecar?.requiresAdoption) throw new Error("Review and adopt this program mapping before publishing");
  if (command !== "connect" && sidecar && (sidecar.version !== 2 || sidecar.backend !== "opengym" || (hash(sidecar.scope) !== hash(expectedScope) || hash(sidecar.program) !== hash(program)))) throw new Error("Backend profile or server mismatch");
  const store = new Store(options.stateDir || config.stateDir, expectedScope);
  if (command === "history") return store.run(async (state) => {
    const from = input?.from ?? "0000-01-01", to = input?.to ?? "9999-12-31", limit = input?.limit ?? 50;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("History requires valid from/to dates and limit 1 to 200");
    const observed = new Set(state.observation?.observedIds || []);
    const observationTime = Date.parse(state.observation?.observedAt);
    const fresh = state.observation?.complete && Number.isFinite(observationTime) && observationTime <= Date.now() && Date.now() - observationTime <= 864e5;
    const observations = [...Object.values(state.workouts), ...state.unresolvedObservations || []].filter((w) => typeof w.date === "string" && w.date >= from && w.date <= to).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit).map((w) => ({ ...w, freshness: !w.id ? "unresolved" : observed.has(w.id) ? fresh ? "observed" : "stale" : "unconfirmed", assignment: state.assignments.find((a) => a.programKey === programKey && a.workoutId === w.id) || null }));
    const { observedIds: _observedIds, ...coverage } = state.observation || {};
    return ok2("history", { coverage: state.observation ? coverage : null, observations, limit }, ["Cached observations; absence does not prove deletion"]);
  }, options.recoverLock);
  if (command === "status") return store.run(async (state) => {
    const observation = state.observation;
    const observedTime = Date.parse(observation?.observedAt);
    const stale = !observation || !observation.complete || !Number.isFinite(observedTime) || observedTime > Date.now() || Date.now() - observedTime > 864e5;
    const { observedIds: _observedIds, ...publicObservation } = observation || {};
    return ok2("status", { scope: expectedScope, jobs: state.jobs.map(({ id, kind, state: state2, retryAt, retryReason, reason }) => ({ id, kind, state: state2, retryAt, retryReason, reason })), observation: observation ? publicObservation : null, stale, activeUnknown: true });
  }, options.recoverLock);
  const client = new Client(config);
  const identity = await client.identity();
  const profileId = identity?.user?.id;
  if (typeof profileId !== "string" || profileId !== expectedScope.profileId || typeof identity.user?.name !== "string" || typeof identity.token?.id !== "string" || !identity.token.id || typeof identity.token.name !== "string" || !(identity.token.exp === null || Number.isInteger(identity.token.exp)) || !identity.token?.scopes || typeof identity.token.scopes !== "object" || Array.isArray(identity.token.scopes) || ["workouts", "plans", "bodyweight", "measurements", "notes"].some((key) => !["off", "view", "apply"].includes(identity.token.scopes[key])) || identity.token.scopes.notes === "apply" || Object.values(identity.token.scopes).some((level) => !["off", "view", "apply"].includes(level))) throw new Error("Profile or scope verification failed");
  const tools = await client.initialize();
  const available = new Set(tools.map((tool) => tool.name));
  const logSchema = tools.find((tool) => tool.name === "log_workout")?.inputSchema;
  const scope = expectedScope;
  const scopes = identity.token.scopes;
  const need = (...names) => {
    for (const name of names) {
      if (!available.has(name)) throw new Error("Required tool unavailable: " + name);
      const group = ["list_workouts", "get_workout", "log_workout"].includes(name) ? "workouts" : ["list_routines", "get_routine", "preview_session", "create_routine", "update_routine"].includes(name) ? "plans" : null;
      if (group && !(scopes[group] === "apply" || !["log_workout", "create_routine", "update_routine"].includes(name) && scopes[group] === "view")) throw new Error("Required token scope unavailable");
      if (name === "search_exercises" && !["workouts", "plans"].some((group2) => ["view", "apply"].includes(scopes[group2]))) throw new Error("Required token scope unavailable");
    }
  };
  const capabilityFingerprint = hash({ tools, scopes });
  const allowMutation = async (job, save) => {
    const marker = await readJson(path2.join(programKey, ".opengym-backend.json"), null);
    if (marker?.version === 2 && marker.backend === "opengym" && hash(marker.scope) === hash(scope) && hash(marker.program) === hash(program) && (marker.requiresAdoption === void 0 || marker.requiresAdoption === false)) return true;
    job.state = "needs_review";
    job.reason = "Review and adopt this program mapping before dispatch";
    delete job.retryAt;
    delete job.retryReason;
    await save();
    return false;
  };
  return store.run(async (state, save) => {
    if (programKey) sidecar = await readJson(path2.join(programKey, ".opengym-backend.json"), null);
    if (command !== "connect" && programKey && (!sidecar || sidecar.version !== 2 || sidecar.backend !== "opengym" || hash(sidecar.scope) !== hash(scope) || hash(sidecar.program) !== hash(program))) throw new Error("Backend profile or server mismatch");
    const adoption = state.adoptionEpochs?.[programKey];
    const fingerprint = adoption ? hash({ fingerprint: capabilityFingerprint, adoption }) : capabilityFingerprint;
    const publicationContext = { need, fingerprint, programKey, schemaAccepts, allowMutation, schemas: Object.fromEntries(tools.map((t) => [t.name, t.inputSchema])) };
    const call = client.call.bind(client);
    client.call = async (name, args) => {
      const now = Date.now();
      state.requestTimes = (state.requestTimes || []).filter((time) => now - time < 6e4);
      if (state.requestTimes.length >= 120) {
        const error = new Error("Local read quota reached; retry later");
        error.code = "local_quota";
        throw error;
      }
      state.requestTimes.push(now);
      await save();
      return call(name, args);
    };
    for (const job of state.jobs) if (job.state === "dispatched") job.state = "uncertain";
    await save();
    if (command === "connect") {
      const requiresAdoption = sidecar && (sidecar.version !== 2 || hash(sidecar.program) !== hash(program) || hash(sidecar.scope) !== hash(scope) || sidecar.requiresAdoption);
      if (requiresAdoption) {
        const projectionPath = path2.join(programDir(options), ".opengym-projection.json");
        const cached = await readJson(projectionPath, null);
        if (cached) await atomicJson(projectionPath, { ...cached, requiresAdoption: true });
      }
      await atomicJson(path2.join(programDir(options), ".opengym-backend.json"), { version: 2, backend: "opengym", scope, program, configPath, ...sidecar && (sidecar.version !== 2 || hash(sidecar.program) !== hash(program) || hash(sidecar.scope) !== hash(scope) || sidecar.requiresAdoption) ? { requiresAdoption: true } : {}, ...options.stateDir || config.stateDir ? { stateDir: options.stateDir || config.stateDir } : {} });
      return ok2("connected", { scope, scopes, capabilities: capabilities.filter((name) => available.has(name)), limitations: ["serverTimezone is a configured assertion, not remotely verified", "Completed freestyle workouts only", "Active workout unknown", "History edits and deletions are unsupported", "Exactly-once delivery is unsupported"] });
    }
    if (command === "search") {
      need("search_exercises");
      const query = input?.query;
      if (typeof query !== "string" || !query.trim()) throw new Error("Exercise search requires a query");
      const result2 = await client.call("search_exercises", { query, limit: 50 });
      if (!Array.isArray(result2.exercises)) throw new Error("Invalid exercise search result");
      return ok2("results", result2);
    }
    if (command === "adopt") {
      need("list_routines", "get_routine", "get_workout");
      const routines = await client.call("list_routines");
      if (!Array.isArray(routines.routines)) throw new Error("Invalid routine list");
      const proposed = options.dryRun ? input : input?.proposed;
      if (!proposed || !Array.isArray(proposed.assignments) || typeof proposed.templates !== "object" || !proposed.templates) throw new Error("Adoption requires explicit templates and assignments");
      const details = {};
      for (const id of Object.values(proposed.templates)) {
        if (typeof id !== "string" || !routines.routines.some((r) => r.id === id)) throw new Error("Mapped routine not found");
        const detail = await captureRoutine(client, id);
        if (detail?.id !== id || !Array.isArray(detail.exercises)) throw new Error("Mapped routine could not be verified");
        details[id] = detail;
      }
      const workouts = {};
      for (const assignment of proposed.assignments) {
        if (!assignment.occurrenceId || !assignment.sessionId || assignment.order != null && !Number.isInteger(assignment.order) || assignment.templateId == null !== (assignment.templateRevision == null) || assignment.templateId != null && (typeof assignment.templateId !== "string" || !assignment.templateId.trim() || typeof assignment.templateRevision !== "string" || !assignment.templateRevision.trim())) throw new Error("Invalid occurrence assignment");
        if (assignment.workoutId) {
          const detail = await client.call("get_workout", { workout_id: assignment.workoutId });
          if (detail?.id !== assignment.workoutId || detail.ambiguous || !Array.isArray(detail.entries || detail.exercises)) throw new Error("Assignment workout could not be verified");
          workouts[assignment.workoutId] = detail;
        }
      }
      let currentMesocycle = null;
      try {
        const n = load(readFileSync(path2.join(programKey, "status.yaml"), "utf8"))?.current_mesocycle;
        if (Number.isInteger(n) && n > 0) currentMesocycle = n;
      } catch {
      }
      const reviewed = { scope, programKey, currentMesocycle, routines, details, workouts, proposed, fingerprint };
      if (options.dryRun) return ok2("review", { ...reviewed, approval: hash(reviewed) });
      if (!input?.approval || hash(input.mapping) !== hash(proposed) || input.approval !== hash(reviewed)) throw new Error("Adoption needs approval of the exact reviewed mapping");
      const ids = proposed.assignments.map((a) => a.occurrenceId);
      if (new Set(ids).size !== ids.length || new Set(proposed.assignments.filter((a) => a.workoutId).map((a) => a.workoutId)).size !== proposed.assignments.filter((a) => a.workoutId).length) throw new Error("Duplicate occurrence or workout assignment");
      const markerPath = path2.join(programDir(options), ".opengym-backend.json");
      const currentMarker = await readJson(markerPath, null);
      if (!currentMarker || currentMarker.version !== 2 || currentMarker.backend !== "opengym" || hash(currentMarker.scope) !== hash(scope) || hash(currentMarker.program) !== hash(program)) throw new Error("Backend profile or server mismatch");
      const projectionPath = path2.join(programDir(options), ".opengym-projection.json");
      const cachedProjection = await readJson(projectionPath, null);
      if (cachedProjection) await atomicJson(projectionPath, { ...cachedProjection, requiresAdoption: true });
      currentMarker.requiresAdoption = true;
      await atomicJson(markerPath, currentMarker);
      Object.assign(sidecar, currentMarker);
      state.adoptionEpochs ||= {};
      state.adoptionEpochs[programKey] = randomUUID2();
      state.mappings = { ...state.mappings, [programKey]: proposed.templates };
      rememberAdoptedBases(state, programKey, proposed.templates, details);
      state.assignmentHistory ||= [];
      const previous = state.assignments.filter((a) => a.programKey === programKey);
      if (previous.length) state.assignmentHistory.push({ programKey, context: state.assignmentContexts?.[programKey] || null, assignments: previous, replacedAt: (/* @__PURE__ */ new Date()).toISOString() });
      state.assignmentContexts ||= {};
      state.assignmentContexts[programKey] = { currentMesocycle };
      state.assignments = [...state.assignments.filter((a) => a.programKey !== programKey), ...proposed.assignments.map((a) => ({ programKey, occurrenceId: a.occurrenceId, sessionId: a.sessionId, ...a.order == null ? {} : { order: a.order }, templateId: a.templateId ?? null, templateRevision: a.templateRevision ?? null, ...a.workoutId ? { workoutId: a.workoutId, verified: true, completedAt: workouts[a.workoutId].date || null } : {} }))];
      Object.assign(state.workouts, workouts);
      for (const assignment of proposed.assignments.filter((a) => a.workoutId)) {
        for (const job of state.jobs.filter((j) => j.kind === "log" && j.programKey === programKey && j.occurrenceId === assignment.occurrenceId && ["draft", "retry_at", "needs_review", "uncertain", "acknowledged"].includes(j.state))) {
          job.state = "resolved";
          job.workoutId = assignment.workoutId;
          delete job.retryAt;
          delete job.retryReason;
        }
      }
      await save();
      if (state.observation) await atomicJson(path2.join(programDir(options), ".opengym-projection.json"), projection(state, state.observation.from, state.observation.to, state.observation.complete, state.observation.observedAt, programKey, program));
      if (sidecar.requiresAdoption) {
        delete sidecar.requiresAdoption;
        await atomicJson(path2.join(programDir(options), ".opengym-backend.json"), sidecar);
      }
      return ok2("adopted", { scope });
    }
    if (command === "sync") {
      need("list_workouts", "get_workout");
      if (!options.once) throw new Error("sync requires --once");
      const from = required(input?.from, "from"), to = required(input?.to, "to");
      const validDate = (value) => /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
      if (!validDate(from) || !validDate(to) || from > to) throw new Error("Invalid date window");
      for (const job of state.jobs.filter((j) => j.kind === "log" && j.programKey === programKey)) {
        if (["uncertain", "acknowledged"].includes(job.state)) await reconcile(client, state, job, save);
        else if (job.programKey === programKey && job.state === "retry_at" && Date.parse(job.retryAt) <= Date.now()) {
          await dispatch(client, state, job, save, { need, fingerprint, programKey, logSchema, allowMutation, serverTimezone: config.serverTimezone });
        }
      }
      for (const job of state.jobs.filter((j) => j.kind === "publish" && j.programKey === programKey)) {
        if (["uncertain", "acknowledged"].includes(job.state) && job.acknowledged) await reconcilePublication(client, state, job, save, publicationContext);
        else if (job.state === "retry_at" && Date.parse(job.retryAt) <= Date.now()) await dispatchPublication(client, state, job, save, publicationContext);
      }
      const result2 = await history(client, from, to, state, save), observedAt = (/* @__PURE__ */ new Date()).toISOString();
      try {
        const snapshot = await client.request("api/token/data");
        if (typeof snapshot?.rev === "number" && Array.isArray(snapshot.state?.workouts)) for (const workout of result2.observations) {
          const raw = snapshot.state.workouts.find((w) => w.id && w.id === workout.id && w.d === workout.date);
          if (raw && Array.isArray(raw.entries)) workout.actualSnapshot = { revision: snapshot.rev, unit: snapshot.state.unit ?? null, entries: raw.entries.map((e) => ({ exerciseId: e.id, sets: e.sets, note: e.note ?? null })), note: raw.note ?? null };
        }
      } catch {
      }
      for (const workout of result2.observations) if (workout.id) state.workouts[workout.id] = workout;
      state.unresolvedObservations = result2.observations.filter((x) => !x.id);
      const complete = result2.complete && !result2.observations.some((x) => !x.id);
      state.observation = { from, to, complete, observedAt, unresolved: result2.observations.filter((x) => !x.id).length, deletionStatus: "unconfirmed", observedIds: result2.observations.filter((x) => x.id).map((x) => x.id), ...result2.pending ? { pending: result2.pending } : {} };
      await save();
      await atomicJson(path2.join(programDir(options), ".opengym-projection.json"), projection(state, from, to, complete, observedAt, programKey, program, Boolean(sidecar.requiresAdoption)));
      const { observedIds: _observedIds, ...publicObservation } = state.observation;
      return ok2(complete ? "synced" : "incomplete", { ...publicObservation, pendingJobs: state.jobs.filter((j) => j.programKey === programKey && ["retry_at", "uncertain", "acknowledged", "needs_review", "conflict"].includes(j.state)).map(({ id, kind, state: state2, retryAt, reason, retryReason }) => ({ id, kind, state: state2, retryAt, reason, retryReason })) }, ["Absence does not prove deletion", "Active workout is unknown"]);
    }
    if (command === "log") {
      need("list_workouts", "get_workout", "log_workout");
      const payload = validateActual(input);
      if (!schemaAccepts(logSchema, { ...payload, dry_run: true })) throw new Error("Native log_workout schema does not accept the requested actual fields");
      if (payload.start != null) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: config.serverTimezone });
        } catch {
          throw new Error("Set serverTimezone to the MCP process IANA timezone and align Docker TZ");
        }
        if (!config.serverTimezone || config.serverTimezone !== input.timezone) throw new Error("Explicit start requires serverTimezone matching the requested timezone; align MCP Docker TZ");
      }
      const id = hash({ kind: "log", scope, programKey, payload, timezone: input.timezone, occurrenceId: input.occurrenceId, sessionId: input.sessionId });
      const canReviewAgain = (job2) => job2.remoteEffect === "none" && !job2.workoutId && !job2.acknowledged && ["draft", "retry_at", "needs_review"].includes(job2.state);
      let job = state.jobs.find((x) => x.id === id), superseded = null;
      if (job && options.dryRun && canReviewAgain(job) && (job.state === "needs_review" || job.fingerprint !== fingerprint)) {
        superseded = job;
        job = null;
      }
      if (!job && options.dryRun) {
        const prior = state.jobs.find((x) => x.kind === "log" && x.programKey === programKey && x.occurrenceId === input.occurrenceId && x.state === "needs_review" && canReviewAgain(x));
        if (prior) superseded = prior;
      }
      if (!job && (state.jobs.some((x) => x !== superseded && x.kind === "log" && x.programKey === programKey && x.occurrenceId === input.occurrenceId) || state.assignments.some((x) => x.programKey === programKey && x.occurrenceId === input.occurrenceId && x.workoutId))) return ok2("needs_review", { reason: "Occurrence already has a workout or another draft" });
      if (job && !options.dryRun && job.state !== "draft") {
        if (["uncertain", "acknowledged"].includes(job.state)) await reconcile(client, state, job, save);
        return ok2(job.state, { id, workoutId: job.workoutId, retryAt: job.retryAt, retryReason: job.retryReason });
      }
      if (!job) {
        const scan = await history(client, payload.date, payload.date);
        if (!scan.complete || scan.observations.length) return ok2("needs_review", { reason: "Possible same-day workout collision or incomplete history" });
        const preview = await client.call("log_workout", { ...payload, dry_run: true });
        if (preview.logged !== false || preview.dry_run !== true || preview.problems || preview.duplicate || preview.duplicate_of || !matchesPreview(preview.would_log, payload)) return ok2("needs_review", { reason: "Workout preview was not accepted" });
        const reviewNonce = randomUUID2();
        const approval = hash({ id, preview, fingerprint, reviewNonce });
        job = { id, kind: "log", state: "draft", remoteEffect: "none", programKey, payload, timezone: input.timezone, occurrenceId: input.occurrenceId, sessionId: input.sessionId, preview, approval, fingerprint, reviewNonce, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
        state.jobs = [...state.jobs.filter((x) => x !== superseded), job];
        await save();
      }
      if (options.dryRun && job.remoteEffect !== "none") return ok2(job.state, { id, workoutId: job.workoutId });
      if (options.dryRun) return ok2("review", { id, approval: job.approval, preview: job.preview, payload: job.payload });
      if (input.approval !== job.approval || job.fingerprint !== fingerprint) throw new Error("Workout approval is missing or stale");
      await dispatch(client, state, job, save, { need, fingerprint, programKey, logSchema, allowMutation, serverTimezone: config.serverTimezone });
      return ok2(job.state, { id, workoutId: job.workoutId, retryAt: job.retryAt, retryReason: job.retryReason });
    }
    if (command === "publish") return publish(client, state, save, publicationContext, input, options.dryRun);
    throw new Error("Unknown command");
  }, options.recoverLock);
}

// src/opengym/cli.mjs
async function main(argv) {
  const command = argv.shift();
  if (command === "--help" || command === "help") return { ok: true, state: "help", data: { commands: ["connect", "search", "adopt", "publish", "log", "sync", "status", "history"], options: ["--config FILE", "--workspace DIR", "--program NAME", "--input FILE", "--state-dir DIR", "--dry-run", "--once", "--recover-lock"], config: { endpoint: "https://openGym.example/", profileId: "profile ID", tokenEnv: "OPENGYM_TOKEN", serverTimezone: "IANA timezone matching the MCP process (required for explicit start; configured, not remotely verified)" }, actualFields: "Use duration_min and note; start is HH:MM; sets use reps or seconds and explicit weight including 0 for bodyweight. Legacy duration and notes aliases are unsupported.", input: { publish: { templateId: "stable local ID", revision: "stable local revision", payload: { name: "Routine name", unit: "kg", exercises: [{ exercise: "verified remote exercise ID", sets: 3, reps: 5, weight: 50 }] }, approval: "approval from publish --dry-run; omit for review", rebase: "true only to review and accept remote edits" }, adoptReview: { templates: { A: "remote-routine-id" }, assignments: [{ occurrenceId: "occ-1", sessionId: "A", workoutId: "remote-workout-id", order: 1, templateId: "local template ID or null", templateRevision: "known revision or null" }, { occurrenceId: "occ-2", sessionId: "B", order: 2 }] }, adoptCommit: { approval: "approval from review", proposed: "exact review input object", mapping: "same exact review input object" }, search: { query: "exercise name" }, sync: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }, history: { from: "YYYY-MM-DD (optional)", to: "YYYY-MM-DD (optional)", limit: "1-200, default 50; cached observations include IDs for adopt" }, log: { occurrenceId: "ID", sessionId: "ID", timezone: "IANA timezone", payload: { date: "YYYY-MM-DD", unit: "kg", exercises: [{ exercise: "remote exercise ID", sets: [{ reps: 5, weight: 40 }] }] } }, logCommit: { occurrenceId: "ID", sessionId: "ID", timezone: "Europe/Paris", payload: { date: "2026-01-01", unit: "kg", exercises: [{ exercise: "remote exercise ID", sets: [{ reps: 5, weight: 40 }] }] }, approval: "approval from log review" } } } };
  const options = {};
  const names = { "--config": "config", "--workspace": "workspace", "--program": "program", "--input": "input", "--state-dir": "stateDir" };
  const flags = { "--dry-run": "dryRun", "--once": "once", "--recover-lock": "recoverLock" };
  while (argv.length) {
    const arg = argv.shift();
    if (names[arg]) {
      if (!argv.length || argv[0].startsWith("--")) throw new Error(`Missing value for ${arg}`);
      options[names[arg]] = argv.shift();
    } else if (flags[arg]) options[flags[arg]] = true;
    else throw new Error("Unknown option");
  }
  if (!["connect", "search", "adopt", "publish", "log", "sync", "status", "history"].includes(command)) throw new Error("Expected connect, search, adopt, publish, log, sync, status or history");
  let sidecar = null;
  if (options.workspace && options.program && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.program)) sidecar = await readJson(path3.join(programDir(options), ".opengym-backend.json"), null);
  if (sidecar && !(command === "connect" && options.config) && (sidecar.version !== 2 || sidecar.backend !== "opengym" || sidecar.program?.workspace !== realpathSync2(options.workspace) || sidecar.program?.name !== options.program)) throw new Error("Backend program binding mismatch; reconnect with --config");
  if (command === "connect" && sidecar && !options.config && (sidecar.version !== 2 || sidecar.program?.workspace !== realpathSync2(options.workspace) || sidecar.program?.name !== options.program)) throw new Error("Reconnect requires explicit --config");
  const configPath = path3.resolve(options.config || sidecar?.configPath || path3.join(homedir2(), ".config", "workout-opengym", "config.json"));
  const config = await readJson(configPath);
  if (!options.stateDir && sidecar?.stateDir) options.stateDir = sidecar.stateDir;
  const input = options.input ? await readJson(path3.resolve(options.input)) : null;
  return run(command, options, input, config, configPath);
}
main(process.argv.slice(2)).then((result2) => {
  process.stdout.write(JSON.stringify(result2) + "\n");
  if (!result2.ok || ["blocked", "error"].includes(result2.state)) process.exitCode = 1;
}).catch((error) => {
  const message = error.code && /^http_\d+$|^rate_limited$|^network_uncertain$|^rpc_error$|^tool_error$|^invalid_/.test(error.code) ? error.code : error.code === "ENOENT" ? "File not found" : error instanceof SyntaxError ? "Invalid JSON" : error instanceof TypeError ? "Invalid configuration or input" : error.message;
  process.stdout.write(JSON.stringify({ ok: false, state: "error", error: message }) + "\n");
  process.exitCode = 1;
});
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.2.0 https://github.com/nodeca/js-yaml @license MIT *)
*/
