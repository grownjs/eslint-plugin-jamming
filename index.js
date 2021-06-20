const fs = require('fs');

const {
  RE_COMMENT_BLOCKS,
  RE_SAFE_SEPARATOR,
  RE_SAFE_WHITESPACE,
  RE_CODING_BLOCKS,
  RE_CONTEXT_MODULE,
  RE_TYPE_MODULE,
  RE_MATCH_QUOTED,
  RE_SPLIT_MARKER,
  RE_EFFECT_LABEL,
  RE_AWAIT_BACK,
  RE_BLOCK_MARK,
  RE_BLOCK_TAGS,
  RE_EACH_CLOSE,
  RE_EACH_TAGS,
  RE_ALL_SEMI,
  RE_FIX_SEMI,
} = require('./const');

const { vars, blocks, disable } = require('./util');

function preprocess(text) {
  text = text.replace(RE_CODING_BLOCKS, (_, kind) => {
    if (kind === 'script') _ = _.replace(RE_EFFECT_LABEL, '/* */');
    return _;
  });

  let tpl = text.replace(RE_COMMENT_BLOCKS, _ => _.replace(RE_SAFE_WHITESPACE, ' '));

  const { locations, components } = blocks(tpl.replace(RE_CODING_BLOCKS, _ => _.replace(RE_SAFE_WHITESPACE, ' ')));
  const shared = {};
  const chunks = [];
  const names = [];
  const deps = [];

  let buffer = '';
  let offset = 0;
  locations.forEach((local, i) => {
    const chunk = tpl.substr(offset, local.offset - offset).replace(RE_ALL_SEMI, _ => _.replace(RE_SAFE_WHITESPACE, ' '));
    const key = `00000${i}`.substr(-5);

    local.locals.forEach(temp => {
      /* istanbul ignore else */
      if (!names.some(x => x.name === temp.name)) names.push(temp);
    });

    buffer += chunk.replace(RE_EACH_CLOSE, '      ;;').replace(RE_SAFE_SEPARATOR, ' ');
    buffer += `;_${key}:${local.block
      .replace(RE_BLOCK_TAGS, _ => _.replace(RE_SAFE_WHITESPACE, ' '))
      .replace(RE_EACH_TAGS, (_, locals) => `{      ${locals.replace(' as', ';let')}`)}`;
    offset = local.offset + local.block.length;
  });

  buffer += tpl.substr(offset).replace(RE_EACH_CLOSE, '      ;;').replace(RE_SAFE_SEPARATOR, ' ');
  buffer = buffer.replace(RE_FIX_SEMI, '}');

  tpl = tpl.replace(RE_CODING_BLOCKS, (_, kind, attr, body) => {
    /* istanbul ignore else */
    if (kind === 'script' && !attr.includes(' src')) {
      const scoped = attr.includes(' scoped');
      const isModule = RE_TYPE_MODULE.test(attr);
      const isContext = RE_CONTEXT_MODULE.test(attr);

      /* istanbul ignore else */
      if (!isModule && !scoped) {
        const info = vars(` ${kind.replace(RE_SAFE_WHITESPACE, ' ')}${attr.replace(RE_SAFE_WHITESPACE, ' ')} ${body}`);
        const set = info.keys.filter(x => info.locals[x] === 'import');
        const idx = text.indexOf(_);
        const use = [];

        let prefix = '';
        let suffix = '';
        if (isContext) {
          Object.assign(shared, info.locals);
          deps.push(...new Set(info.keys.concat(info.deps)));
          chunks.push({
            offset: [idx, _.length],
            names: names.filter(x => info.deps.includes(x.name) || set.includes(x.name)),
          });
        } else {
          const fixedDeps = [...new Set(info.keys.concat(info.deps))].filter(x => names.some(y => y.name === x));
          const consts = fixedDeps.filter(x => info.locals[x] !== 'var' && info.locals[x] !== 'let');
          const lets = fixedDeps.filter(x => info.locals[x] === 'var');

          /* istanbul ignore else */
          if (info.hasVars) {
            Object.assign(shared, info.locals);
            deps.push(...fixedDeps);

            components.forEach(x => {
              /* istanbul ignore else */
              if (set.includes(x.name) && !consts.includes(x.name)) consts.push(x.name);
            });

            chunks.push({
              offset: [idx, _.length],
              names: names.filter(x => info.keys.includes(x.name))
                .concat(components.filter(x => info.keys.includes(x.name))),
            });

            const fixed = deps.filter(x => !fixedDeps.includes(x));

            consts.push(...fixed);
            use.push(...fixed);
          } else {
            use.push(...deps);
          }

          /* istanbul ignore else */
          if (consts.length) {
            suffix = `${disable(consts.join(';'), [
              'semi-spacing',
              'no-unused-expressions',
            ])};</script>`;
          }
          /* istanbul ignore else */
          if (lets.length) {
            suffix = `${disable(consts.concat(lets).join(';'), [
              'semi-spacing',
              'no-unused-expressions',
            ])};</script>`;
          }
          /* istanbul ignore else */
          if (use.length) {
            prefix += `let ${use.join(', ')};`;
          }
        }

        /* istanbul ignore else */
        if (use.length) {
          suffix = suffix || `${disable(use.join(';'), [
            'semi-spacing',
            'no-unused-expressions',
          ])};</script>`;
        }

        /* istanbul ignore else */
        if (suffix) {
          text = text.substr(0, idx)
            + text.substr(idx, _.length).replace('</script>', suffix)
            + text.substr(idx + _.length);
        }

        /* istanbul ignore else */
        if (prefix) {
          const diff = idx + kind.length + attr.length + 2;

          text = `${text.substr(0, diff)}${disable(prefix, [
            'one-var',
            'no-void',
            'semi-spacing',
            'one-var-declaration-per-line',
          ])}${text.substr(diff)}`;
        }
      }
    }
    return _.replace(RE_SAFE_WHITESPACE, ' ');
  });

  const used = chunks.reduce((memo, cur) => {
    memo.push(...cur.names.map(x => x.name));
    return memo;
  }, []);

  const missed = components.filter(x => !used.includes(x.name));

  /* istanbul ignore else */
  if (missed.length) {
    chunks.push({
      code: `<script>${disable(`${missed.map(x => `/*!#${x.offset}*/${x.name};`).join('')}`, [
        'max-len',
        'semi-spacing',
        'spaced-comment',
        'no-unused-expressions',
      ])}</script>`,
    });
  }

  /* istanbul ignore else */
  if (locations.length) {
    const fixed = names.filter(x => deps.includes(x.name));
    const prefix = fixed.length ? `let ${fixed.map(x => x.name).join(', ')};` : '';

    /* istanbul ignore else */
    if (fixed.length) {
      chunks.push({
        code: `<script>${disable(prefix, [
          'semi',
          'semi-style',
          'semi-spacing',
          'one-var',
          'max-len',
          'no-empty',
          'brace-style',
          'padded-blocks',
          'one-var-declaration-per-line',
          'no-multiple-empty-lines',
          'no-multi-spaces',
          'no-trailing-spaces',
          'no-extra-semi',
          'block-spacing',
          'space-before-blocks',
          'no-unused-expressions',
        ], true)}\n${buffer}</script>`,
      });
    }
  }

  chunks.forEach(chunk => {
    /* istanbul ignore else */
    if (chunk.names && chunk.names.length) {
      const suffix = `${chunk.names.map(x => `/*!#${x.offset}*/${x.name};`).join('')}`;
      const [index, length] = chunk.offset;

      text = text.substr(0, index)
        + text.substr(...chunk.offset).replace('</script>', `${disable(suffix, [
          'max-len',
          'semi-spacing',
          'block-spacing',
          'spaced-comment',
          'no-unused-expressions',
        ], true)}</script>`)
        + text.substr(index + length);
    }
  });

  return [text, ...chunks.filter(x => !x.names).map(x => x.code)];
}

function postprocess(messages, filename) {
  return messages.reduce((memo, it) => memo.concat(it.map(chunk => {
    /* istanbul ignore else */
    if (chunk.source) chunk.source = chunk.source.replace(RE_AWAIT_BACK, 'await');

    /* istanbul ignore else */
    if ((chunk.ruleId === null && !chunk.message.includes('eslint-disable'))
      || chunk.ruleId === 'no-undef'
      || chunk.ruleId === 'no-unused-vars'
    ) {
      /* istanbul ignore else */
      if (RE_BLOCK_MARK.test(chunk.source)) {
        const left = chunk.source.substr(0, chunk.column);
        const diff = (left.split(RE_BLOCK_MARK).length - 1) * 8;
        const local = chunk.ruleId === 'no-unused-vars' && left.includes(';let ') ? 1 : 0;

        if (chunk.fatal) {
          chunk.column -= diff + local;
          chunk.line -= 1;
          chunk.endColumn = chunk.column;
          chunk.endLine = chunk.line;
        } else {
          chunk.endColumn -= diff + local;
          chunk.endLine -= 1;
          chunk.column -= diff + local;
          chunk.line -= 1;
        }
      }

      /* istanbul ignore else */
      if (chunk.source.includes('</script>')) {
        const matches = chunk.source.substr(1).split(';');
        const name = chunk.message.match(RE_MATCH_QUOTED)[2];

        for (const test of matches) {
          const [, offset, length, local] = test.match(RE_SPLIT_MARKER) || [];

          /* istanbul ignore else */
          if (local === name) {
            const tpl = fs.readFileSync(filename).toString();

            let line = 1;
            let col = 0;
            for (let i = 0; i < tpl.length; i += 1) {
              /* istanbul ignore else */
              if (i === +offset) break;
              if (tpl[i] === '\n') {
                line += 1;
                col = 0;
              } else {
                col += 1;
              }
            }

            chunk.endColumn = col + +length + 1;
            chunk.endLine = line;
            chunk.column = col + 1;
            chunk.line = line;
            break;
          }
        }
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
        node: true,
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
