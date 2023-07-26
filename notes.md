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
    * importing data
        * csv to class
        * ability to convert columns into relations by text-matching


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
        * Q: what happens if a class A is in a junction table as the butt-end of another property 1, and then you want to create a property 2 in A which links with property 1?
            * presumably the relations would transfer
        * AH! addendum to rule: the class itself is included as one of the things something can be linked to. 
            * so the columns in the junction table will either be properties or the classes themselves
* so ultimately from my revelation just now junction tables will need:
    * a list of participants, which just accounts for every class and class.property which has a column in the table
        * for properties, this data is specified:
            * the count
            * the targets, which may or may not be linked
            * any other special things about it, such as an expression determining possible or actual relations
    * a list of "links", specifying when what is selected by one property should be mirrored by another
* I should make a decision tree for the modification of a relation prop and its affects on new or existing junction tables, classes, and properties
* I started decision tree below — starting to really think that all the property data should be stored in the junction metadata, otherwise things will get messy fast
* another complication: if a property targets itself, it needs to appear twice in the junction table
    * maybe the second column can have a suffix like `_self`
* another revelation that just came to me: there's no need to put everything in one junction table. what I can do is have each and every relation between two properties or between a property and a class be its own junction table. This may make things considerably simpler than I was anticipating
    * the metadata related to a property, in this case, could stay on that property.
        * it would list each target, and for each, it would point to a corresponding junction table. 
    * it could be specified in the junction table's metadata whether the junction was linked. this would amount, basically, to whether it was between two properties or between a property and a class
    * adding a new target=creating a new junction table
    * I would have to account for what happens if a target is removed on a property and on either side of linked properties
    * linking a previously unlinked target to a property would be a matter of renaming one of the columns in the table and adjusting the metadata
    * self-to-self links wouldn't present any big nightmares
* maybe "count" could be generalized to a "max" condition?
    * although maybe in the interface still making it a toggle between the single and multi-select that people are familiar with


### Junction table decision flow

Tree: creating or modifying a relation prop
* creating:
    * new or existing junction table?
        * if new:
            * what participants
                * do classes/props exist or do they need to be created?
            * what links
        * if existing:
* modifying:
    * targets to be added?
        * do they exist?
        * are they linked?
        * are they in the participant list?
            * if not, column needs to be added to the junction table
    * link to be made?
        * is the class of the linked prop already a target of this prop? or is this class a target of the linked class?
            * if so, columns need to be renamed 

Okay maybe to simplify, and if all the information about a relation property is stored in the junction tree's metadata:

* A change in targets requires:
    * checking to see if those targets exist, and creating them (creating a class, creating a property, or both)
    * checking to see which targets are in the participant list
        * if not there, add them by adding them to the participant list and as columns in the junction table
    * If targets are going away, check if they are targets of any other participant prop, and if not remove that participant from the participant list and the column list
* A change in links requires:
    * checking to see if either property in the link is currently in the junction && already targeting the opposite class
        * if so, the relations have to be transferred from property A->class B to property A<->property B to  and validated
* in all cases:
    * a validation of all properties involved to make sure link and count rules are being followed





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



### Test suite checklist

- [ ] create a class
- [ ] add a row to a class
- [ ] add a data property to a class

Relation properties:
- [ ] add a linked relation property to a class, linking it to new property in an existing class
- [ ] add a linked relation propery to a class, linking it to new property in a new class
- [ ] add a linked relation property to class A, linking it to an existing relation property in class B which has class A as a target


