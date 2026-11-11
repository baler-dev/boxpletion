# Change Log

All notable changes to the "boxpletion" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## v0.2.0

### What's new

In general, names you import with `box::use()` now complete where you use them, without running the import first. The following lists specify the changes along the patches: 

-  Completion of pre-imported names outside `box::use()`: `module$`, attached names and module aliases.

-  Pre-imported functions are inserted as `name()` with the cursor inside; datasets and values are inserted as they are.

-  Data objects like data frames from installed packages are also offered, using a lookup that does not load the package.

-  Re-exported modules are followed, so `box::use(./foo[bar])` completes `bar$`.

-  Names that are aliases of functions, or built with `new_class()`, `new_generic()`, `setClass()`, `Vectorize()`, `Negate()`, `partial()` or `compose()`, are treated as functions.

## v0.1.0

- Initial release