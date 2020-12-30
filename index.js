const RE_EFFECTS = /\$:\s*(?:\w+[^;]+\s*\{[\s\S]+?\}|\{[\s\S]+?\};|[^;]+?;)\n/g;
const RE_SCRIPTS = /<script([^<>]*)>([\s\S]*?)<\/script>/g;

function preprocess(text, filename) {
  text = text.replace(RE_SCRIPTS, (_, attrs, content) => {
    content = content.replace(RE_EFFECTS, block => {
      block = block.replace(/\bawait\b/g, '/* */');
      return block;
    });

    return `<script${attrs}>${content}</script>`;
  });

  return [text];
}

function postprocess(messages, filename) {
  return messages.reduce((memo, it) => memo.concat(it.map(chunk => {
    chunk.source = chunk.source.replace(/\/\* \*\//g, 'await');
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
