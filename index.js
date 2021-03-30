const RE_IMPORTS = /(?:^|[;\s]+)?import\s*(?:\*\s*as)?\s*(\w*?)\s*,?\s*(?:\{([^]*?)\})?\s*from\s*['"]([^'"]+)['"];?/g;
const RE_EXPORTS = /\bexport\s+(let|const|(?:async\s+)?function(?:\s*\*)?|(?:default\s*)?\{)\s+(\*?[\s\w,=]+)/g;
const RE_STYLES = /<style([^<>]*)>([^]*?)<\/style>/g;
const RE_SCRIPTS = /<script([^<>]*)>([^]*?)<\/script>/g;
const RE_COMMENTS = /(?!:) +\/\/.*?(?=\n)|\/\*[^]*?\*\//g;
const RE_ALL_BLOCKS = /\([^()]*?\)|\[[^[\]]*?\]|\{[^{}]*?\}/;
const RE_EXPORT_IMPORT = /\bexport\s+[*\s\w]*|import[^]+?[\n;]/g;

const fs = require('fs');

function extract(template) {
  const tags = [];
  const matches = template.replace(/<!--[^]*?-->/g, '').match(/<\w+[^<>]*>/g);

  if (matches) {
    matches.map(x => {
      const tag = x.substr(1).split(/[\s/>]/)[0];

      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    });
  }
  return tags;
}

function variables(template, parent) {
  const info = {
    input: [],
  };

  template = template.replace(RE_STYLES, '');
  template = template.replace(RE_SCRIPTS, '');
  template = template.replace(/<!--[^]*?-->/g, '');

  if (template.indexOf('{') === -1
    && template.indexOf('}') === -1
  ) return info;

  let matches;

  if (template.indexOf('{{#') !== -1 || template.indexOf('{{^') !== -1) {
    do {
      matches = template.match(/\{\{([#^]((?!section)[^#{}/]+)(?:[\w\s-]+?)?)\}\}([^]+?)\{\{\/\2\}\}/);

      if (matches) {
        const [, fixedKey, prop] = matches[1].split(/[\s#^]/);
        let fixedItem = info.input.find(x => x.key === (prop || fixedKey));

        template = template.replace(matches[0], '');

        if (!fixedItem) {
          fixedItem = { key: prop || fixedKey };

          if (matches[1].charAt() === '^') {
            fixedItem.unless = true;
          }
          if (!parent) {
            fixedItem.root = true;
          }
          info.input.push(fixedItem);
        }
        info.input.push(...variables(matches[3], fixedItem).input);
      }
    } while (matches);
  }

  do {
    matches = template.match(/\{\{\s*((?![.>])[^{}^>]+)\s*\}\}|\{\s*([^{}^>]+)\s*\}/);

    if (matches) {
      template = template.replace(matches[0], '');

      const [fixedKey] = (matches[1] || matches[2]).replace(/^(?:[#/^]|\.{3})/g, '').split(/[\s.]/);

      let fixedItem;
      if (fixedKey.charAt() === ':' || fixedKey === 'section') continue;
      if (!info.input.find(x => x.key === fixedKey)) {
        fixedItem = { key: fixedKey };
      }

      if (fixedItem) {
        if (!parent) {
          fixedItem.root = true;
        }
        info.input.push(fixedItem);
      }
    }
  } while (matches);
  return info;
}

function preprocess(text, filename) {
  const special = ['Jamming', 'Fragment'];
  const vars = variables(text).input;
  const tags = extract(text);
  const aliased = {};
  const shared = {};
  const seen = [];

  text = text.replace(RE_COMMENTS, matches => {
    if (!/<\/|(^|\b)(?:eslint|global)\b(?=[\s\w,-]+)/.test(matches)) {
      return matches.split('\n').map(() => '/* */').join('\n');
    }
    return matches;
  }).replace(/(?<=[=:]\s*)\bawait\b/g, '/* */');

  const body = text.replace(RE_SCRIPTS, (_, attrs, content) => {
    const isModule = /(?:^|\b)context=(["']?)module\1(?:\b|$)/.test(attrs);
    const isScoped = /\s+scoped(?:="(?:scoped|true)")?/.test(attrs);

    let scope = content.replace(RE_EXPORT_IMPORT, ';');
    do scope = scope.replace(RE_ALL_BLOCKS, ';'); while (RE_ALL_BLOCKS.test(scope));

    const matches = scope.match(/\b(?:let|const|function(?:\s*\*?))\s+(.+?)(?==|[;\n])/g);
    const locals = matches ? matches.reduce((memo, cur) => {
      const [kind, ...rest] = cur.replace(/=[^=]*?(?=,|$)/g, '').trim().split(/\s+/);
      const set = rest.join('').split(/\s*,\s*/);

      set.forEach(x => {
        const temp = x.replace(/\*|async\s+/g, '').split(/\s*=\s*/);
        temp.forEach(key => {
          if (!isModule) shared[key] = kind;
          memo[key] = kind;
        });
      });
      return memo;
    }, {}) : [];

    (content.match(RE_EXPORTS) || []).forEach(re => {
      if (re.includes(' default')) {
        seen.push('default');
      } else if (re.includes('{')) {
        const [alias, name] = re.replace(/.+?\{\s*/, '').trim().split(/\s+as\s+/)
        shared[name] = shared[alias];
        aliased[name] = alias;
      } else {
        const [, kind, name] = re.replace(/\*|async\s+/g, '').split(/\s+/);
        shared[name] = kind;
      }
    });

    content.replace(RE_IMPORTS, (_, base, req, dep) => {
      (req || base).trim().split(/\s*,\s*/).forEach(key => {
        if (key) {
          const [ref, alias] = key.split(/\s+as\s+/);
          shared[alias || ref] = 'import';
        }
      });
    });

    const keys = Object.keys(shared).filter(key => {
      if (shared[key] === 'import') {
        if (tags.includes(key)) vars.push({ key });
        if (vars.find(x => x.key === key)) return true;
        return false;
      } else if (shared[key] !== 'noop') seen.push(key);
      return locals[key];
    }).concat(isScoped ? special : []);

    let prefix = '';
    let suffix = '';
    if (!isModule) {
      const fixed = Object.keys(shared).filter(key => shared[key] === 'module');

      if (fixed.length) {
        prefix = `/* eslint-disable */let ${fixed.join(', ')};/* eslint-enable */`;
      }

      if (keys.length) {
        seen.push(...keys);
        keys.forEach(key => { shared[key] = 'noop'; });
        suffix = `/* eslint-disable no-unused-expressions, no-extra-semi, semi-spacing */;${keys.join(';')};/* eslint-enable */`;
      }
    } else {
      Object.keys(locals).forEach(key => { shared[key] = 'module'; });
    }

    if (isScoped) {
      prefix = `/* global ${special.join(', ')} */${prefix}`;
    }

    return `<script${attrs}>${prefix}${content}${suffix}</script>`;
  });

  const end = vars.filter(x => x.root && !seen.includes(x.key) && shared[x.key] !== 'import').map(x => x.key);
  const out = [body].concat(end.length
    ? `<script>/* eslint-disable no-unused-expressions, no-extra-semi, semi-spacing */;${end.join(';')};/* eslint-enable */</script>`
    : []);

  return out;
}

function postprocess(messages, filename) {
  const text = fs.readFileSync(filename).toString();
  const vars = variables(text).input.map(x => [x.key, new RegExp(`^(.*?\\{\\{\\s*(?:#stream\\s+|[^>]?\\s*))${x.key}(?:\\.[\\w.]+|[\\w\\s-]+)?\\s*\\}\\}`)]);

  const locs = text.split('\n').reduce((memo, line, nth) => {
    for (let i = 0; i < vars.length; i += 1) {
      if (!memo[vars[i][0]] && vars[i][1].test(line)) {
        memo[vars[i][0]] = [nth + 1, line.match(vars[i][1])[1].length + 1];
      }
    }
    return memo;
  }, {});

  return messages.reduce((memo, it) => memo.concat(it.map(chunk => {
    if (chunk.source) {
      chunk.source = chunk.source.replace(/\/\* \*\//g, 'await');
    }
    if (chunk.ruleId == 'no-undef') {
      const key = chunk.message.match(/(["'])(\w+)\1/)[2];

      if (locs[key]) {
        chunk.column = locs[key][1];
        chunk.line = chunk.endLine = locs[key][0];
        chunk.endColumn = locs[key][1] + key.length;
      }
    }
    return chunk;
  })), []);
}

require('eslint-plugin-html');

module.exports = {
  configs: {
    config: {
      parserOptions: {
        ecmaVersion: 2019,
        sourceType: 'module',
      },
      plugins: ['jamming'],
      env: {
        es6: true,
        browser: true,
      },
      rules: {
        indent: 0,
        camelcase: 0,
        'eol-last': 0,
        'object-shorthand': 0,
        'function-paren-newline': 0,
        'arrow-body-style': 0,
        'consistent-return': 0,
        'global-require': 0,
        'no-labels': 0,
        'no-console': 0,
        'no-bitwise': 0,
        'no-plusplus': 0,
        'no-await-in-loop': 0,
        'no-multi-assign': 0,
        'no-unused-labels': 0,
        'no-restricted-syntax': 0,
        'no-underscore-dangle': 0,
        'no-param-reassign': 0,
        'no-restricted-globals': 0,
        'no-useless-computed-key': 0,
        'prefer-destructuring': 0,
        'prefer-spread': 0,
        'prefer-const': 0,
        'prefer-rest-params': 0,
        'prefer-arrow-callback': 0,
        'import/first': 0,
        'import/extensions': 0,
        'import/newline-after-import': 0,
        'import/no-extraneous-dependencies': 0,
        'import/no-dynamic-require': 0,
        'import/no-unresolved': 0,
        'import/no-mutable-exports': 0,
        'import/prefer-default-export': 0,
        'arrow-parens': ['error', 'as-needed'],
      },
    },
  },
  processors: {
    '.html': {
      preprocess,
      postprocess,
      supportsAutofix: true,
    },
  },
};
