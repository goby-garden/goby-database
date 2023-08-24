

### Present to-do<sup>*</sup>:



- [ ] use new class retrieval function to perform validation and make sure all relations in a junction at least abide by the `max` set for that function
- [ ] create `delete relation property` function

_<sup>*</sup>occasionally outdated/bypassed_

---

### Things this program should be able to do:

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

---

### Stored data
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


---

### Core concepts:
* relations types are a unit, embodied by a junction table
    * they define a type of property, shared across its constituent classes

---

### Junction tables

* the targeting problem in the old system(see [ref](https://www.are.na/block/17459572)):
    * when you make a relation, you can pick multiple targets. the question is: can those targets have each other as possible relations? in other words, can that junction table host relationships not involving the class on which the junction was initiated?
* the resolution:
    * an overhaul of the way relations are stored and structured, so that it all around makes more sense and isn't arbitrarily tied to the shape of a big junction table (see next bullet)
* the new system:
    * when you make a relation property, you pick targets like before
    * you can just pick a class as a target, in which case it's one-way, _or_ you can additionally specify a property in a targeted class to link it with
        * The big change here is that properties can specify which targets they link with, rather than having to be "linked" across the board (which didn't make much sense anyway). And they can target any set of classes/link with any property as long as they follow a common sense rule:
    * the basic rule governing possible relationships is that a property can only be linked to one property from a class
        * however, that one property can be itself
        * Q: can two properties within the same class be linked to each other?
            * A: Yes. Imagine "parent of" and "child of" properties.
        * Q: what happens if you start with a class_1.property_A targeting class_2 without any link, and decide to link it with class_2.property B ?
            * I would transfer any unlinked relations from class_1.property_A to this new link, along with any unlinked relations from class_2.property_B which target class_1
            * only caveat is I would validate the relations to make sure they don't violate any constraints on either property, e.g. class_1.property_A having a limit of 1 relation per object
    * the technical implementation: individual junction tables
        * rather than have a single junction table for all of the targets of a property, I'm going to have one junction table for each target. It will have just two columns, one for each class/class.property.
            * following the rule above, the only condition is there can only be one junction table for a class.property and another class
            * junctionlist structure:
                | id | class A id | prop A id | class B id | prop B id | metadata |
            * each junction structure:
                | classA_id_propA_id | classB_id(_propB_id) |
* maybe "count" could be generalized to a "max" condition?
    * although maybe in the interface still making it a toggle between the single and multi-select that people are familiar with
    * this doesn't work because the conditions are supposed to determine candidates for a relation, and if this is a condition then a single select will have no candidates

---

#### Junction table decision flow

* Q: does the exact match of classA.property to classB[.property] (or inverse) exist?
    * A: no
        * create it
        * Q: is there a B.property?
            * A: no
                * do nothing
            * A: yes
                * add the property to a queue to be validated
    * A: yes
        * do nothing
* check for changes in targets (presence or linking), or receive them already-listed, and then make any transfers or deletions of junction tables necessary.
* Validation: 
    * iterate over each object in the class and make sure its relations for this property follow its constraints (which also cleans things up if the constraints changed or if a transfer has happened through another property)

---

### Return format for relation properties:
* for each row, an array of the objects its connected to, in the format: `{class_id:X,prop_id:X,object_id:X}`

---

### Names versus IDs:
* One goal is to make the sql database on its own basically legible
* However, without care, names will run amuck and renaming something will require changing the name in a thousand places. 
* The approach to this for classes and properties will be to have their names on the actual tables and columns, and their IDs in places where metadata for classes is stored, so at most you only need to change their name in two places

---

### Development thoughts:

* the idea is this package will be imported as a module into the application
    * https://stackoverflow.com/questions/15806241/how-to-specify-local-modules-as-npm-package-dependencies

* possibly will make it a cli before i make it a gui
    * https://www.npmjs.com/package/prompts
* for class retrieval, possibly create a [custom aggregate function](https://github.com/WiseLibs/better-sqlite3/blob/v5.0.1/docs/api.md#aggregatename-options---this)
* all user input functions begin with "action" and

---

### Misplaced interface thoughts:
* relation-select reactivity: instead of some array-copying madness, just have the selector set to the current items as an event, fired with every data update
* editing relations:
    * I think I'm going to narrow from the previous iteration of the relation creator/editor so you can only configure one relation at a time, meaning you can't edit the constraints on the other relations
* since a system-wide undo/redo could be quite difficult to implement, an alternative could be using transactions, so after making a change, particularly a table structure change, you would be prompted to commit or reject changes
    * MAYBE there could even be an enterable "transaction mode", in which you make a variety of changes, and then make a decision about whether to accept or reject them.

---

### Misplaced general organization thoughts:
* maybe the website can have a kind of "timeline" pulling in the goby are.na channels using the api, letting you drag a slider to move forward/backward in the notes i take about it, which appear as a scattered collage

---

### Test suite checklist

Basic:
- [ ] create a class
- [ ] delete a class
    - deal with relation fall-out
- [ ] add a row to a class
- [ ] delete a row from a class
    - deal with relation fall-out
- [ ] add a data property to a class
- [ ] delete a property from a class
    - not allowed if class only has one property
    - deal with fallout if that class is the label

Relation properties — test the following actions/options in relevant combinations with each other:
- [ ] adding a new relation prop
- [ ] setting the `conditions.max` (formerly `count`) and validating relations correspondingly
- [ ] deleting a relation prop
- [ ] linking a relation prop to another prop, new or existing
- [ ] having a property target its own parent class
- [ ] removing a link between two props
- [ ] adding a new relation

Returning data:
- [ ] return relation props in the format specified in _Return format for relation properties_

---

### Structure of SQL request including relation prop structured as JSON array

```
WITH cte AS (SELECT person, ('[' || GROUP_CONCAT(clothing,',') || ']') AS clothing
  FROM (
    
    SELECT person, json_object('type','shirt','id',shirts) AS clothing
    FROM junction_shirts

    UNION

    SELECT person, json_object('type','pant','id',pants) AS clothing
    FROM junction_pants

    UNION

    SELECT person, json_object('type','shoe','id',shoes) AS clothing
    FROM junction_shoes)
GROUP BY person)
SELECT p.id, p.name, c.clothing
FROM people p LEFT JOIN cte c
ON c.person = p.id;

```

---

### Finished to-do archive:
- [x] set up comparison of old targets to the new targets in `configure_relation_targets` so I don't have to rely on the changes being passed in from the front-end
- [x] for `case 'unlink'` in `clean_up_junctions`, have any non-existent one-sided junction tables created on the spot
- [x] write a new class retrieval function that groups relations so each relation property is an array of objects with the format: `{class_id:X,prop_id:X,object_id:X}`
- [x] test the modification of existing relation props and their links in `sandbox.js` to work out the kinks