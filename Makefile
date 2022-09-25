PWD=$(shell pwd)

ci: deps
	@(unlink $(PWD)/node_modules/eslint-plugin-jamrock > /dev/null 2>&1) || true
	@ln -s $(PWD) $(PWD)/node_modules/eslint-plugin-jamrock
	@npm test

add\:%:
	@cp -r test/samples/01-syntax test/samples/$*

deps:
	@(((ls node_modules | grep .) > /dev/null 2>&1) || npm i) || true
