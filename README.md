# boxpletion

Autocomplete hints for `box::use()` in R files.

- After `box::use(`, type a module path and `/` to see modules and submodules.
- Inside `[]`, see the names a module exports.

Works with local modules (`./`, `../`) and {baler} modules installed in `~/.baler/modules`. It reads files and never runs R. CRAN packages are not supported yet.
