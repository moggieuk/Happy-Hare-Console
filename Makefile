# Happy Hare Console
#
# make test        run the JavaScript tests and the installer tests
# make lint        check the Python files with ruff
# make spellcheck  check US English spelling with CSpell
# make serve       serve the Console at http://127.0.0.1:8000/ for development

PYTHON ?= python3
PORT ?= 8000
CSPELL_VERSION ?= 9.8.0

.PHONY: test test-js test-install lint spellcheck serve

test: test-js test-install

test-js:
	node --test console/*.test.mjs

test-install:
	$(PYTHON) -m unittest discover -s test

lint:
	ruff check

# Pass additional CSpell options through ARGS, e.g. make spellcheck ARGS='--no-summary'.
spellcheck:
	@command -v npx >/dev/null 2>&1 || { echo "Node.js/npm is required to run CSpell"; exit 1; }
	@git ls-files -- '*.py' '*.md' '*.yml' '*.toml' '*.sh' '*.conf' 'Makefile' \
		':(exclude).cspell.config.yml' | \
		npx --yes cspell@$(CSPELL_VERSION) lint --no-progress --file-list stdin $(ARGS)

serve:
	$(PYTHON) -m http.server $(PORT) --bind 127.0.0.1 --directory console
