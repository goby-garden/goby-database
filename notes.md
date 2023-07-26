Things this program should be able to do:

* initialization
    * check if system tables exist, if not, create:
        * root object (rows/cells) table that generates/records their unique ID
        * junction table for individual relations
        * class list
        * junction table list
        * image data table for all image data, referenced elsewhere by file name

* user actions:
    * create a class
    * define properties on classes
        * static data
        * relations
            * create and/or modify the participant classes
            * create and/or modify the junction table
    * create objects in classes
    * enter data for property
    * undo anything (can this be achieved?)
        * sqlite [undo/redo](https://www.sqlite.org/undoredo.html) allows you to define an "undo event/barrier" so you can set actions in steps
        * I might be better off just using [transaction ROLLBACK](https://www.digitalocean.com/community/tutorials/sql-commit-sql-rollback)
            * https://github.com/WiseLibs/better-sqlite3/issues/49
            * maybe command-S based to generate a back-up
            * OR maybe I can just use the [`checkpoint()` function](https://github.com/WiseLibs/better-sqlite3/blob/v5.0.1/docs/api.md#checkpointdatabasename---this) in better-sqlite3


* utilities:
    * create a table
        * core system tables
        * user-defined class tables (recording members of a class and their static properties)
        * junction tables (recording defined relations between classes)

* data retrieval:
    * retrieving data related to classes or objects in json form
    * pagination-friendly

* validation:
    * changing column type
        * from multiple to single
        * int to string and back
    * defining new relations
        * making sure objects on the single-select side of a relation aren't added to multiple objects in another class
        * class-to-self relations
    * deleting rows, columns, and classes
        * for relational properties, the related class should have the option of dropping their column, converting to a string, or (if they're connected to other existing classes) just removing those relations

Stored data
* class metadata:
    * functional:
        * properties
            * type
            * junction ID if relevant
            * property ID
            * styling: order, whether or not it displays, its column width
    * styling:
        * the property it uses as a label (default:name)
        * its color


Core concepts:
* relations types are a unit, embodied by a junction table
    * they define a type of property, shared across its constituent classes



Junction tables
* on each class, what needs to be stored on the property is:
    * the junction ID
* the junction metadata stores:
    * participant class properties
        * for each property, single or multiple
        * for each property, the class.properties they can choose from (targets)
* solving the targeting problem (see [ref](https://www.are.na/block/17459572))
    * when you make a relation, you can pick multiple targets. the question is: do those targets have each other as possible relations? in other words, can that junction table host relationships not involving the class on which the junction was initiated
    * the resolution:
        * each participant has a list of the class.properties they're allowed to pick from
* I need to think about the interface for constructing a linked relationship
    * what I could possibly do is have it list possible properties that could be linked. 
    * the key is a property can only be in one linked junction table
    * this possibly calls for some diagramming in the interface
* I'm realizing a raw list of "participants" is not gonna work here.
    * What I need at the least is a list of "links" specifying which properties are linked to which.
    * The rule is: a property can only be linked to one property from a class.
        * however, that one property can be itself.
        * Q: can two properties within the same class be linked to each other?
            * A: Yes. Imagine "parent of" and "child of" properties.


Names versus IDs:
* One goal is to make the sql database on its own basically legible
* However, without care, names will run amuck and renaming something will require changing the name in a thousand places. 
* The approach to this for classes and properties will be to have their names on the actual tables and columns, and their IDs in places where metadata for classes is stored, so at most you only need to change their name in two places


development:

* the idea is this package will be imported as a module into the application
    * https://stackoverflow.com/questions/15806241/how-to-specify-local-modules-as-npm-package-dependencies

* possibly will make it a cli before i make it a gui
    * https://www.npmjs.com/package/prompts
* for class retrieval, possibly create a [custom aggregate function](https://github.com/WiseLibs/better-sqlite3/blob/v5.0.1/docs/api.md#aggregatename-options---this)
* all user input functions begin with "action" and

interface:
* relation-select reactivity: instead of some array-copying madness, just have the selector set to the current items as an event, fired with every data update




Test action list:
* create a class
* add a row to a class
* add a data property to a class

* Relation properties:
    * add a linked relation property to a class, linking it to a new property in an existing class
    * add a linked relation propery to a class, linking it to new property in a new class
    * add a linked relation property to class A, linking it to an existing relation property in class B which has class A as a target
