const {
  RE_COMMENT_INLINE,
  RE_COMMENT_SAFE,
  RE_EXPORTED_SYMBOLS,
  RE_SAFE_WHITESPACE,
  RE_SPLIT_WHITESPACE,
  RE_SPLIT_COMMA,
  RE_SPLIT_EQUAL,
  RE_SPLIT_AS,
  RE_IMPORTED_SYMBOLS,
  RE_EXPORT_IMPORT,
  RE_ALL_BLOCKS,
  RE_MATCH_LOCAL,
  RE_MATCH_TAGNAME,
  RE_CAPTURE_VARIABLES,
  RE_ACCESED_SYMBOLS,
  RE_CLEAN_FUNCTION,
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

function vars(code, replace) {
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
  const locals = {};
  const children = [];

  /* istanbul ignore else */
  if (RE_EXPORTED_SYMBOLS.test(code)) {
    code.match(RE_EXPORTED_SYMBOLS).forEach(re => {
      const [, kind, name] = re.replace(RE_CLEAN_FUNCTION, '').trim().split(RE_SPLIT_WHITESPACE);

      name.split(RE_SPLIT_COMMA).forEach(k => {
        const v = k.split(RE_SPLIT_EQUAL)[0];

        locals[v] = kind;
        keys.push(v);
      });
      hasVars = true;
    });
  }

  /* istanbul ignore else */
  if (RE_IMPORTED_SYMBOLS.test(code)) {
    code.replace(RE_IMPORTED_SYMBOLS, (_, base, req, dep) => {
      /* istanbul ignore else */
      if (!children.includes(dep)) children.push(dep);
      (req || base || '').trim().split(RE_SPLIT_COMMA).forEach(key => {
        /* istanbul ignore else */
        if (key) {
          const [ref, alias] = key.split(RE_SPLIT_AS);
          locals[alias || ref] = 'import';
          keys.push(alias || ref);
        }
      });
      hasVars = true;
      return _;
    });
  }

  let out = code.replace(RE_EXPORT_IMPORT, _ => _.replace(RE_SAFE_WHITESPACE, ' '));
  do out = out.replace(RE_ALL_BLOCKS, _ => _.replace(RE_SAFE_WHITESPACE, ' ')); while (RE_ALL_BLOCKS.test(out));

  do {
    const matches = out.match(RE_MATCH_LOCAL);

    /* istanbul ignore else */
    if (!matches) break;

    const [_, kind, expr] = matches;

    out = out.replace(_, _.replace(RE_SAFE_WHITESPACE, ' '));

    /* istanbul ignore else */
    if (replace && kind === 'let') {
      code = code.replace(_, _.replace('let ', '/**/'), matches.index);
    }

    expr.split(RE_SPLIT_COMMA).forEach(x => { // eslint-disable-line
      const key = x.split(RE_SPLIT_EQUAL)[0].trim();

      /* istanbul ignore else */
      if (!locals[key]) {
        if (kind === 'let') {
          locals[key] = 'var';
          keys.push(key);
        } else {
          locals[key] = kind.replace(RE_CLEAN_FUNCTION, '').trim();
        }
        deps.push(key);
        hasVars = true;
      }
    });
  } while (true); // eslint-disable-line

  return {
    hasVars, children, locals, keys, deps, code,
  };
}

function blocks(chunk) {
  const components = [];
  const locations = [];

  do {
    const matches = chunk.match(RE_MATCH_TAGNAME);

    /* istanbul ignore else */
    if (!matches) break;

    components.push({
      name: matches[1],
      offset: [matches.index, matches[0].length],
    });

    chunk = chunk.replace(`<${matches[1]}`, ` ${matches[1].replace(RE_SAFE_WHITESPACE, ' ')}`);
  } while (true); // eslint-disable-line

  do {
    const matches = chunk.match(RE_CAPTURE_VARIABLES);
    /* istanbul ignore else */
    if (!matches) break;

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
        });
      }

      offset += local.index + local[0].length;
    } while (RE_ACCESED_SYMBOLS.test(tmp));

    locations.push({ block: matches[0], offset: [matches.index, matches[0].length], locals });
    chunk = chunk.replace(matches[0], matches[0].replace(RE_SAFE_WHITESPACE, ' '));
  } while (true); // eslint-disable-line

  return { locations, components };
}

function disable(code, rules, ending) {
  return `/* eslint-disable ${rules ? `${rules.join(', ')} ` : ''}*/${code}${!ending ? '/* eslint-enable */' : ''}`;
}

module.exports = {
  vars,
  blocks,
  disable,
};
