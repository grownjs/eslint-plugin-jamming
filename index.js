const RE_EFFECTS = /(?<!\/\/.*?)\s*\$:\s*((?:do|if|for|while|await|yield|switch)[^{;}]*?\{[^]*?\}(?=\n)|\{[^]*?\}(?=;\n|$)|[^]*?(?=;\n|$))/g;
const RE_IMPORTS = /(?:^|[;\s]+)?import\s*(?:\*\s*as)?\s*(\w*?)\s*,?\s*(?:\{([^]*?)\})?\s*from\s*['"]([^'"]+)['"];?/g;
const RE_EXPORTS = /\bexport\s+(let|const|function)\s+([\s\w,=]+)/g;
const RE_SCRIPTS = /<script([^<>]*)>([^]*?)<\/script>/g;
const RE_COMMENTS = /(?!:)\s*\/\/.*?(?=\n)|\/\*[^]*?\*\//g;

const fs = require('fs');

function variables(template, parent) {
  const info = {
    input: [],
  };

  template = template.replace(/<!--[^]*?-->/g, '');

  if (template.indexOf('{{') === -1
    && template.indexOf('}}') === -1
  ) return info;

  let matches;

  if (template.indexOf('{{#') !== -1 || template.indexOf('{{^') !== -1) {
    do {
      matches = template.match(/\{\{([#^]([^#{}/]+))\}\}([\s\S]+?)\{\{\/\2\}\}/);

      if (matches) {
        const fixedKey = (matches.length === 4 ? matches[2] : matches[3]).split('.')[0].trim();
        let fixedItem = info.input.find(x => x.key === fixedKey);

        template = template.replace(matches[0], '');

        if (!fixedItem) {
          fixedItem = { key: fixedKey, type: 'leaf' };

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
    matches = template.match(/\{\{\s*([^\s{}^>]+)\s*\}\}/);

    if (matches) {
      template = template.replace(matches[0], '');

      const fixedKey = matches[1].replace(/^[#/^]/g, '').split('.')[0].trim();

      if (fixedKey !== 'section' && !info.input.find(x => x.key === fixedKey)) {
        const fixedItem = { key: fixedKey };

        if (parent) {
          fixedItem.nested = true;
        }
        info.input.push(fixedItem);
      }
    }
  } while (matches);
  return info;
}

function preprocess(text, filename) {
  const vars = variables(text).input;
  const shared = {};

  return [text.replace(RE_SCRIPTS, (_, attrs, content) => {
    content = content.replace(RE_COMMENTS, matches => {
      return matches.split('\n').map(() => '').join('\n');
    });

    content = content.replace(RE_EFFECTS, block => {
      block = block.replace(/\bawait\b/g, '/* */');
      return block;
    });

    (content.match(RE_EXPORTS) || []).forEach(re => {
      const [, kind, name] = re.split(' ');
      shared[name] = kind;
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
      if (shared[key] === 'import') return false;
      const regex = new RegExp(`\\b${shared[key]}\\s+${key}\\b`);
      if (regex.test(content)) return false;
      return true;
    });

    let prefix = '';
    if (keys.length) {
      prefix = `/* eslint-disable */let ${keys.join(', ')};/* eslint-enable */`;
    }

    const fixedVars = vars.filter(x => (
      shared[x.key]
        ? !['const', 'let'].includes(shared[x.key])
        : !['default', 'class'].includes(x.key)
    )).filter(x => !x.nested || shared[x.key] === 'import').map(x => x.key);

    let suffix = '';
    if (fixedVars.length) {
      suffix = `\n/* eslint-disable no-unused-expressions, no-extra-semi, semi-spacing */;${fixedVars.join(';')};/* eslint-enable */\n`;
    }

    return `<script${attrs}>${prefix}${content}${suffix}</script>`;
  })];
}

function postprocess(messages, filename) {
  const text = fs.readFileSync(filename).toString();
  const vars = variables(text).input.map(x => [x.key, new RegExp(`^(.*?\\{\\{[^>]?\\s*)${x.key}(?:\\.[\\w.]+)?\\s*\\}\\}`)]);

  const locs = text.split('\n').reduce((memo, line, nth) => {
    for (let i = 0; i < vars.length; i += 1) {
      if (!memo[vars[i][0]] && vars[i][1].test(line)) {
        const prefix = line.match(vars[i][1])[1];

        memo[vars[i][0]] = [nth + 1, prefix.length + 1];
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
      plugins: ['fruition'],
      env: {
        es6: true,
        browser: true,
      },
      rules: {
        indent: 0,
        camelcase: 0,
        'object-shorthand': 0,
        'function-paren-newline': 0,
        'arrow-body-style': 0,
        'consistent-return': 0,
        'global-require': 0,
        'no-labels': 0,
        'no-console': 0,
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
