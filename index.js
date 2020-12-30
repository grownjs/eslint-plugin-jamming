const RE_EFFECTS = /\$:\s*(?:\w+[^;]+\s*\{[\s\S]+?\}|\{[\s\S]+?\};|[^;]+?;)\n/g;
const RE_SCRIPTS = /<script([^<>]*)>([\s\S]*?)<\/script>/g;
const RE_EXPORT_SYMBOLS = /\bexport\s+(\w+)\s+(\w+)/g;

function preprocess(text, filename) {
  const locals = (text.match(RE_EXPORT_SYMBOLS) || []).reduce((memo, re) => {
    const [, kind, name] = re.split(' ');
    memo[name] = kind;
    return memo;
  }, {});

  text = text.replace(RE_SCRIPTS, (_, attrs, content) => {
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

    return `<script${attrs}>${prefix}${content}</script>`;
  });
  return [text];
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
  processors: {
    '.html': {
      preprocess,
      postprocess,
      supportsAutofix: true,
    },
  },
};
