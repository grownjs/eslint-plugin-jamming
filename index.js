const RE_EFFECTS = /\$:\s*(?:\w+[^;]+\s*\{[\s\S]+?\}|\{[\s\S]+?\};|[^;]+?;)\n/g;
const RE_SCRIPTS = /<script([^<>]*)>([\s\S]*?)<\/script>/g;
const RE_EXPORT_SYMBOLS = /\bexport\s+(\w+)\s+(\w+)/g;

function variables(template) {
  const info = {
    input: [],
  };

  if (template.indexOf('{{') === -1
    && template.indexOf('}}') === -1
  ) return info;

  let matches;

  if (template.indexOf('{{#') !== -1 || template.indexOf('{{^') !== -1) {
    do {
      matches = template.match(/\{\{([#^]([^#{}/]+))\}\}([\s\S]+?)\{\{\/\2\}\}/);

      if (matches) {
        const fixedKey = (matches.length === 4 ? matches[2] : matches[3]).split('.')[0].trim();

        template = template.replace(matches[0], '');

        if (!info.input.find(x => x.key === fixedKey)) {
          const fixedItem = { key: fixedKey };

          if (matches[1].charAt() === '^') {
            fixedItem.unless = true;
          }
          info.input.push(fixedItem);
        }
      }
    } while (matches);
  }

  do {
    matches = template.match(/\{\{([^#{}/^>]+)\}\}/);

    if (matches) {
      template = template.replace(matches[0], '');

      const fixedKey = matches[1].replace(/^[#^]/g, '').split('.')[0].trim();

      if (!info.input.find(x => x.key === fixedKey)) {
        info.input.push({ key: fixedKey });
      }
    }
  } while (matches);
  return info;
}

function preprocess(text, filename) {
  const locals = (text.match(RE_EXPORT_SYMBOLS) || []).reduce((memo, re) => {
    const [, kind, name] = re.split(' ');
    memo[name] = kind;
    return memo;
  }, {});

  const vars = variables(text).input.map(x => x.key);

  return [text.replace(RE_SCRIPTS, (_, attrs, content) => {
    content = content.replace(RE_EFFECTS, block => {
      block = block.replace(/\bawait\b/g, '/* */');
      return block;
    });

    const keys = Object.keys(locals).filter(key => {
      const regex = new RegExp(`\\b${locals[key]}\\s+${key}\\b`);
      if (regex.test(content)) return false;
      return true;
    });

    let prefix = '';
    if (keys.length) {
      prefix = `/* eslint-disable */let ${keys.join(', ')};/* eslint-enable */`;
    }

    const fixedVars = vars.filter(x => !locals[x]);
    let suffix = '';
    if (fixedVars.length) {
      suffix = `/* eslint-disable no-unused-expressions, no-extra-semi, semi-spacing */;${fixedVars.join(';')};/* eslint-enable */\n`;
    }

    return `<script${attrs}>${prefix}${content}${suffix}</script>`;
  })];
}

function postprocess(messages, filename) {
  return messages.reduce((memo, it) => memo.concat(it.map(chunk => {
    if (chunk.source) {
      chunk.source = chunk.source.replace(/\/\* \*\//g, 'await');
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
