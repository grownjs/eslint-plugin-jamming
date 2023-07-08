const {
  RE_COMMENT_INLINE,
  RE_COMMENT_SAFE,
  RE_EXPORTED_ALIASES,
  RE_EXPORTED_SYMBOLS,
  RE_SAFE_WHITESPACE,
  RE_SPLIT_WHITESPACE,
  RE_SPLIT_COMMA,
  RE_SPLIT_EQUAL,
  RE_SPLIT_AS,
  RE_FIX_VARS,
  RE_KEYWORD_NAMES,
  RE_IMPORTED_SYMBOLS,
  RE_EXPORT_MATCH,
  RE_IMPORT_MATCH,
  RE_ALL_BLOCKS,
  RE_MATCH_LOCAL,
  RE_MATCH_TAGNAME,
  RE_CAPTURE_VARIABLES,
  RE_ACCESED_SYMBOLS,
  RE_CLEAN_FUNCTION,
  RE_EFFECT_LOCALS,
  RE_SAFE_LOCALS,
  RE_CODING_BLOCKS,
} = require('./const');

const WELL_KNOWN_SYMBOLS = [
  'true',
  'false',
  'null',
  'NaN',
  'JSON',
  'Reflect',
  'Proxy',
  'Intl',
  'AsyncFunction',
  'Generator',
  'Promise',
  'Symbol',
  'Object',
  'Array',
  'Uint8Array',
  'String',
  'RegExp',
  'Date',
  'Math',
  'Number',
  'Function',
  'Boolean',
  'Infinity',
  'undefined',
  'isFinite',
  'isNan',
  'parseFloat',
  'parseInt',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'Error',
  'EvalError',
  'InternalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'ArrayBuffer',
];

function vars(code) {
  code = code.replace(RE_COMMENT_INLINE, matches => {
    /* istanbul ignore else */
    if (!RE_COMMENT_SAFE.test(matches)) {
      return matches.replace(RE_SAFE_WHITESPACE, ' ');
    }
    return matches;
  });

  let hasVars = false;
  const keys = [];
  const deps = [];
  const temps = {};
  const locals = {};
  const imports = {};
  const aliases = {};
  const effects = [];
  const children = [];

  /* istanbul ignore else */
  if (RE_EXPORTED_SYMBOLS.test(code)) {
    code.match(RE_EXPORTED_SYMBOLS).forEach(re => {
      const [, kind, name] = re.replace(RE_CLEAN_FUNCTION, '').trim().split(RE_SPLIT_WHITESPACE);

      name.split(RE_SPLIT_COMMA).forEach(k => {
        const v = k.split(RE_SPLIT_EQUAL)[0].trim();

        /* istanbul ignore else */
        if (v) {
          locals[v] = kind;
          keys.push(v);
        }
      });
      hasVars = true;
    });
  }

  /* istanbul ignore else */
  if (RE_IMPORTED_SYMBOLS.test(code)) {
    code.replace(RE_IMPORTED_SYMBOLS, (_, base, req, dep) => {
      const input = [];

      (req || base || '').trim().split(RE_SPLIT_COMMA).forEach(key => {
        /* istanbul ignore else */
        if (key) {
          const [ref, alias] = key.split(RE_SPLIT_AS);

          /* istanbul ignore else */
          if (alias) aliases[ref] = alias;

          locals[alias || ref] = 'import';
          keys.push(alias || ref);
          input.push(alias || ref);
        }
      });
      /* istanbul ignore else */
      if (!children.includes(dep)) {
        imports[dep] = input;
        children.push(dep);
      }
      hasVars = true;
      return _;
    });
  }

  let out = code.replace(RE_IMPORT_MATCH, _ => _.replace(RE_SAFE_WHITESPACE, ' '));

  out = out.replace(RE_SAFE_LOCALS, (_, i) => {
    temps[`@@var${i}`] = _;
    return `@@var${i}`;
  });

  do out = out.replace(RE_ALL_BLOCKS, _ => _.replace(RE_SAFE_WHITESPACE, ' ')); while (RE_ALL_BLOCKS.test(out));
  out = out.replace(/@@var\d+/g, _ => temps[_]);

  /* istanbul ignore else */
  if (RE_EXPORTED_ALIASES.test(code)) {
    code.match(RE_EXPORTED_ALIASES).forEach(re => {
      re.split(',').forEach(sub => {
        const [ref, alias] = sub.replace('{', '').replace('}', '').trim().split(' as ');

        /* istanbul ignore else */
        if (alias) aliases[ref] = alias;
      });
    });
  }

  do {
    const matches = out.match(RE_MATCH_LOCAL);

    /* istanbul ignore else */
    if (!matches) break;

    const [_, kind, expr] = matches;
    const exported = RE_EXPORT_MATCH.test(_);

    out = out.replace(_, _.replace(RE_SAFE_WHITESPACE, ' '));
    out = out.replace(RE_EXPORT_MATCH, x => x.replace(RE_SAFE_WHITESPACE, ' '));

    /* istanbul ignore else */
    if (expr.charAt() === '{' || RE_KEYWORD_NAMES.test(expr)) continue; // eslint-disable-line

    expr.replace(RE_FIX_VARS, ' ').split(RE_SPLIT_COMMA).forEach(x => { // eslint-disable-line
      const key = x.split(RE_SPLIT_EQUAL)[0].trim();

      /* istanbul ignore else */
      if (key && !locals[key]) {
        /* istanbul ignore else */
        if (kind === '$:') {
          effects.push(key);
          return true;
        }

        if (kind === 'let') {
          locals[key] = aliases[key] ? 'export' : 'var';
        } else {
          locals[key] = kind.replace(RE_CLEAN_FUNCTION, '').trim();
        }

        if (exported || aliases[key]) {
          keys.push(key);
        } else {
          deps.push(key);
        }
        hasVars = true;
      }
    });
  } while (true); // eslint-disable-line

  const variables = (code.match(RE_EFFECT_LOCALS) || [])
    .map(x => x.split(/[:=]/)[1].trim())
    .filter(local => !locals[local]);

  return {
    hasVars, variables, children, imports, aliases, effects, locals, keys, deps, code,
  };
}

function blocks(chunk, notags) {
  const components = [];
  const locations = [];
  const offsets = [];

  let line = 1;
  let col = 0;
  for (let i = 0; i < chunk.length; i += 1) {
    if (chunk[i] === '\n') {
      line += 1;
      col = 0;
    } else {
      col += 1;
    }
    offsets[i] = { line, col };
  }

  chunk = chunk.replace(RE_CODING_BLOCKS, _ => _.replace(RE_SAFE_WHITESPACE, ' '));

  if (notags !== false) {
    do {
      const matches = chunk.match(RE_MATCH_TAGNAME);

      /* istanbul ignore else */
      if (!matches) break;

      components.push({
        name: matches[1],
        offset: [matches.index, matches[0].length],
        position: offsets[matches.index],
      });

      chunk = chunk.replace(`<${matches[1]}`, ` ${matches[1].replace(RE_SAFE_WHITESPACE, ' ')}`);
    } while (true); // eslint-disable-line
  }

  do {
    const matches = chunk.match(RE_CAPTURE_VARIABLES);
    /* istanbul ignore else */
    if (!matches) break;

    const position = offsets[matches.index];
    const locals = [];

    let tmp = matches[0];
    let offset = matches.index;
    do {
      const local = tmp.match(RE_ACCESED_SYMBOLS);
      /* istanbul ignore else */
      if (!local) break;

      tmp = tmp.substr(local.index + local[0].length);

      /* istanbul ignore else */
      if (!WELL_KNOWN_SYMBOLS.includes(local[0])) {
        locals.push({
          name: local[0],
          offset: [local.index + offset, local[0].length],
          position: offsets[local.index],
        });
      }

      offset += local.index + local[0].length;
    } while (RE_ACCESED_SYMBOLS.test(tmp));

    locations.push({
      block: matches[0], offset: [matches.index, matches[0].length], locals, position,
    });
    chunk = chunk.replace(matches[0], matches[0].replace(RE_SAFE_WHITESPACE, ' '));
  } while (true); // eslint-disable-line

  return { locations, components };
}

function disable(code, rules, ending) {
  return `/* eslint-disable ${rules ? `${rules.join(', ')} ` : ''}*/${code}${!ending ? '/* eslint-enable */' : ''}`;
}

function location(code, offset) {
  let line = 1;
  let col = 0;
  for (let i = 0; i < code.length; i += 1) {
    /* istanbul ignore else */
    if (i === +offset) break;
    if (code[i] === '\n') {
      line += 1;
      col = 0;
    } else {
      col += 1;
    }
  }
  return { line, col };
}

module.exports = {
  vars,
  blocks,
  disable,
  location,
};
