process.chdir(__dirname);

const { CLIEngine } = require('eslint');
const assert = require('assert');
const fs = require('fs');

const cli = new CLIEngine({ reportUnusedDisableDirectives: true });

for (const name of fs.readdirSync('samples')) {
  if (name[0] !== '.') {
    console.log(name);
    const actual_messages = cli.executeOnFiles([`samples/${name}/test.html`]).results[0].messages;
    fs.writeFileSync(`samples/${name}/actual.json`, JSON.stringify(actual_messages, null, '\t'));
    const expected_messages = JSON.parse(fs.readFileSync(`samples/${name}/expected.json`).toString());
    assert.equal(actual_messages.length, expected_messages.length);
    assert.deepStrictEqual(actual_messages, actual_messages.map((message, i) => ({ ...message, ...expected_messages[i] })));
    console.log('passed!\n');
  }
}
