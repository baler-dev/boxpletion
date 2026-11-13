# Change Log

All notable changes to the "boxpletion" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## Development Version

### What's new

Under new changes, the documentation and their parameter names (if exist) are exposed and can be completed. Here are more details: 

-  The signature help for imported functions are exposed, when you type `name(` or something and see the arguments, with the current one highlighted.

-  The documentation for imported functions are pre-rendered and exposed, just like when you type a function in Positron/VS code. Except, the title, the description, and each described argument and the returned value, are also showed, not just what they return (Positron is currently like this).

   -  Functions from installed packages are documented from their help pages, read without loading the package.
  
   -  Rd markup in roxygen text, such as `\code{}`, `\emph{}` and `\link{}`, is shown as markdown.

-  As from local modules and `box-bale` modules, the documentation through Roxygen2 comments above them are pre-rendered. Aliases such as `fn1 = fn` use the docs of `fn`.
    
   -  Names re-exported with a wildcard, as in `box::use(./a[...])` tagged with `@export`, are now completed through the module that re-exports them.

-  Argument names inside a call are offered as `name = `, with their description.

-  New setting `boxpletion.trace` logs completion and signature requests to the boxpletion output channel. It is off by default.

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
