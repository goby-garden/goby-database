I intend for this to be the core module Goby uses to represent and manipulate the data structure of a project, which is stored as an SQLite database

Directory:
* `notes.md` is my running notes doc for the project.
* `index.js` will be main script (warning, lots of currently non-functional unfinished code)
* `sandbox.js` will be a kind of test suite
* `outdated_v0.json` is the first version I made of this module, used in the version of goby that I put together for my undergraduate thesis. I’m pulling a lot of the design of the new module from here, but there are a few big conceptual changes, particularly around how relation properties will work and be supported by junction tables in the back-end architecture.