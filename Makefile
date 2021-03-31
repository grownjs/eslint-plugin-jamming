PWD=$(shell pwd)

ci: deps
	@unlink $(PWD)/node_modules/eslint-plugin-jamming || true
	@ln -s $(PWD) $(PWD)/node_modules/eslint-plugin-jamming
	@npm test

add\:%:
	@cp -r test/samples/01-syntax test/samples/$*

deps:
	@(((ls node_modules | grep .) > /dev/null 2>&1) || npm i --silent) || true
