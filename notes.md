### Contents:

1. [running notes](#running-notes)
2. [technical terminology](#goby-technical-terminology)
3. [things this program should be able to do](#things-this-program-should-be-able-to-do)

...and more below

### Running notes

#### <span class="date">6/23/2025</span>

Following my last goby-interface note, I’m removing all references to the item cache, which is pretty easy because it wasn’t really doing anything yet. 

The thing I will need to do in its stead now is modify my class/workspace retrieval functions to manually pull the items for the classes I need, since I was previously relying on automatic caching filling in the items when I fetched them. So a few steps (to do in reverse order):

- [x] change `retrieve_workspace_contents` to retrieve all class metadata instead of a subset, and do it with `retrieve_all_classes` instead of the cache.
    - instead request just a subset of items, i.e. the ones for the classes which appear as blocks.
- [x] modify `retrieve_all_classes` to take a parameter which specifies which items to fetch for each class (if any). Then use `retrieve_class_items` to populate the items when requested. This will be the foundation for pagination. But for now I can just set the range to `null` so it fetches all the class items when requested.
- [x] modify `retrieve_class_items` to accept a pagination range (or `null` for all items as mentioned, and later on I can actually implement the pagination).
- [x] modify the `items` property of the `ClassData` type to record the pagination state in addition to the actual array of items.
   - should include an attribute for the range of items fetched (page size, page #, sort order), and also a attribute for the columns/properties, which can either be a list of IDs or a generalized string setting like "all" or "slim"
   - this will obviously have trickle effects to the interface. luckily with typescript, all the errors that this change generates should bubble up as type errors in my code editor.

#### <span class="date">6/22/2025</span>

Today I’m working on rendering the selection fields in the interface (we’ll see how far I’m able to get!). I realized that my class item retrieval function doesn’t return any information about relation property values beyond the class and item IDs of selected rows, i.e. the minimal information to identify them. My first thought was that I could add a helper function that just returns all of the possible options for a relation prop, since that will be needed anyway for the dropdown fields. But I still have a dream of this library being useful as a standalone API to interact with goby databases, and to that end I think that the item retrieval function should probably be a tad more robust in its return value. Not that it should return the full item, but I think it should have enough information to display a list of selected items. 

This gets me to a feature which I’ve envisioned including for a long time: a ”label” attribute, indicating which property of a class should be used as the signifier for its items in more abbreviated displays. 

- One thing that I will have to sort out, and recall dealing with in the initial implementation of all this, is what happens when the label value is empty for an item? How should it display as an ”option”? I may have a more robust answer to this later on, but for now I think I will just filter these out in the option list. In the “selected” option display, maybe I will let these remain, but just show the item ID.

- Another question is where to store the information about which property is the label. One possibility is storing it in the property table as an SQLite column on the property itself. This appeals to me because I’ve been trying to move away from encoding data in stringified JSON. I could also store it as a foreign key column in the class registry, e.g. `label_property` (actually, I suppose I couldn’t do it as a foreign key because properties have their own per class tables). Lastly I could store it as a `label` key in the metadata JSON for the class. Despite this not having the advantages of normalization and possible SQLite-native validation, I think this is actually an attribute that I may want to be mutable. For example in the future I could want to add the ability to concatenate multiple properties into a label, so that people can add things like emoji/icons and possibly even image thumbnails. So in conclusion of this thought, I’m inclined to go this latter direction.

> Note to self upon exploring the foreign key idea: with any current and future foreign keys, I should consider how to handle deleting referenced items, given SQLite’s [default behavior and possibly useful behavior options](https://www.sqlite.org/foreignkeys.html#fk_actions).

Aside from this change to the return of relation properties, I will also need to change the item retrieval function to support retrieving all the options, as I mentioned. For that I want to add a paremeter which basically pares down the return value to just item ID and label.


#### <span class="date">4/13/2025</span>

I’m working on creating a sample “groceries” project to develop the interface with, using a dataset I assembled of our typical recipes and grocery list. As ever, working with test data is challenging my assumptions about what the editor should be able to accomodate: I have two properties in my recipes table, “ingredients”, and “nice-to-have”, which both reference my “ingredients” table. Then in the ingredients table, I have a ”used by” property, which you would expect to be linked to _both_ of these recipe props. However, this isn’t allowed by my schema editing function (which happily my error-catching prevented), because although it would be mostly doable structurally, it would be difficult to resolve in the interface. I.e. when you opened the dropdown to select recipes for "used by", there would be no default way of specifying or knowing if it would make a relation with the "ingredients" or the "nice-to-have" property in Recipes. 

I think I’m fine with this limitation for now, though in the future it could be worth enabling it and thinking about how it would be resolved by the interface. Maybe it could be based on priority, like when creating the relationships I would set it so that when selecting from the ingredients side, it would always reflect the changes in the ingredients prop rather than used by. I would also need to account for multiple properties in a row selecting the same item, in which case I (probably?) wouldn’t want to list a single item twice.

#### <span class="date">1/18/2025</span>

Picking up on the reflection from the 16th: I’ve taken care of cases where transfers get queued for nonexistent targets, and general duplicate actions, by filtering those out in the consolidation step. The open question is what to do when someone deletes a property which was previously a target, and then adds their own new target within the same class. Normally when you delete a property which was a target, I queue the creation of a one-way relation to replace it, and transfer the connections from the previous two-way. 

It’s an open question whether to keep that behavior at all, since I could imagine the function just deleting everything that involves deleted targets, with no attempts at preserving data. Likely the interface will automatically handle some of this anyway, and send an input that takes it into account. But on the other hand I think it is nice, especially if someone uses the class as a programmatic interface (not that I necessarily see that happening, but maybe if this project miraculously takes off). So I think I’ll leave it in, and in the future what I could do is make that an option, e.g. "safe mode", set to true/false, that way you can bypass it if you prefer.

What I’d like to do though, since this problem is about validation with other relationship edits, is to address it in the consolidation function. And I think I have a way to accomplish that: when consolidating, if there are multiple creations/transfers involving the same pair of classes and one matching property, pick the one with the highest level of specificity, meaning privilege prop targets to class targets. 


#### <span class="date">1/16/2025</span>

- I think I need to modify my logic for deleting or creating relations on the basis of classes/properties being deleted
    - e.g. if I delete a property, but rather than targeting the whole class, I already have a change queued to move the target to a different property. In that situation, it should honor what’s already in the queue instead of queing or overriding another transfer
    - also, what happens if the classes on either side of a relation are deleted? there may technically be available transfers individually, but they cancel each other out. I need to make sure the classes and properties in new_sides, exist, otherwise reject a transfer and just delete.

#### <span class="date">1/13/2025</span>

Current to-do:
- [x] refactor junctions so that:
    - in the junction list, the following are normalized: side_a_class_id, side_a_prop_id, side_b_class_id, side_b_prop_id
        - should be retrieved as a JunctionSides json array
    - in individual junctions, the columns should be a little more descriptive, e.g. class_2_property_5 or class_3
- [x] refactor properties so they exist in their own tables, and are created when classes are created
- [x] refactor class/junction retrieval and caching
    - [x] reflect above changes 
    - [x] separate retrieval of items, properties, and relations
    - [x] get relation targets from junction list rather than storing them on the property (DRY)
- [ ] implement junction transfer 
- [ ] take a pass at unifying/clarifying the terminology a little bit
    - maybe replace "junction" with "relationship" and "relation" with "connection"?

--- 

Currently working through revising the edit schema function. The class and prop edit loops were simple enough but the relationship edits introduce some complexity:

- relationships can be one-way (e.g. class A prop 1 -> class B) or two-way (e.g. class A prop 1 <-> class B prop 2)
- if a two-way is converted to a one-way, or vice versa (i.e., when **both of the classes** and **at least one of the properties** persist) we want to transfer the old connections to the new relationship, instead of deleting entirely.
- I should also enforce the rule that a property can only target one property from a class

How to handle this? What I’m thinking: 

1. create a new consolidated edits array
2. add the type:"transfer" relations to the array
3. loop through type:"create" relations
    - check if there’s an existing relation that matches both classes and one property
        - if it exists:
            - look for a type:"delete" which deletes this relation
                - if there’s a delete, push a transfer
                - if there’s not a delete, ignore this creation because it’s invalid
        - if it does not exist
            - add the type:"create" normally
4. loop through the type:"delete" relations
    - check if there’s already a transfer for it in the consolidated array, and ignore if so
5. loop through the consolidated edits array and apply the changes



#### <span class="date">1/7/2025</span>

- the current dilemma is an empty selection is showing up for `FROM` in the class retrieval SQL query, causing a syntax error. I’ve isolated the problem to be that in the sandbox file, I’m attempting to create a relation property without specifying targets, although the property implicitly has some targets, just based on the junctions I’m declaring in the same `action_edit_class_schema` call. So there are a few dimensions here:

- I want to figure out why my type definitions for the input to that function aren’t flagging that there should be `relation_targets` for properties being created
- I need an approach to relation props that do not have any targets. I don’t necessarily want to allow someone to create them manually, but if all the targeted classes gets deleted, I need a way of handling that which does not break things. Here is my inclination: 

    1. In the interface, _warn_ you if your changes will result in a relation property without any targets. Allow them to do it though, because I know it would be annoying to have to go through editing every property which depends on a class before deleting the class itself.

    2. Conditionally handle empty relation props in the class retrieval function by making them return an empty array instead of it breaking by trying select out of nonexistent SQL tables

- I wonder at what stage I should be performing validation for synchronicity between the junctions and the classes being created. There have sort of been two schools of thought I’ve been bouncing between while building `action_edit_class_schema`:
    - goby-interface will regardless have to implement a way of on-the-fly editing the staged schema in concert with the GUI, so the input that this function will be getting programmatically _should_ be correct.
    - _However_, I may want to expose this function for developers to use outside of the goby-interface environment, and it should be modular and stable enough to not crash the database if you fuck something up (such as the error I’m encountering in my sandbox). Part of that is just doing type-checking to prevent malformed inputs, which would resolve my current issue, but part of it is making sure the input is logically consistent. 
    
Right now there is a level of redundancy involved, in that I’m specifying both a list of changes to classes, which include some of the relationships which are specified by the junction list. I think in an earlier incarnation of this function, assuming I set it up correctly (which without types is a little iffy to me), it may have been able to infer the targets from the junctions. In any case there’s not an exact parity between the two arrays, such that I could inversely infer the whole junction list directly from the list of changes to classes, because it is the _whole_ junction list: a list of every relationship that is recorded by the project database. Then there’s `action_update_relations`, which is independently performing validation and figuring out what SQL changes need to be made by simply comparing the current and staged lists of junctions.

I think I wanted to pass the whole junction list because that’s way easier from the side of the interface. I will likely have the junctions separated into their own array rather than only implicitly contained in the properties, because that’s a convenient way to represent the data and because it prevents me from having to fetch the whole schema of every class. Then in the editing mode, instead of recording each edit to the relations, I would just need to record the new holistic state and give it to my code here to deal with it. But if I’m doing diffing somewhere anyway, I might as well handle that logic on the front-end, or even provide myself with some utility functions via this package to do it there.

In terms of what actually makes sense to pass to `action_edit_class_schema`, I think I ought to only include the class array, and compile a list of resulting junction changes. What does this entail in terms of handling?

- For property creation: simple enough, create new junctions for each of the targets of the new property
- For class creation: no need to do anything unless a relation property is also created
- For class deletion: delete all the relations which involve this class (see discussion above of empty relations)
- For property deletion: delete any junction tables for one-way class targets of this property. For two-way property targets, instead of completely deleting the tables, I want to convert them to represent one-way class targets by the surviving property
- For property modification: if the targets change, I just need to create or delete the corresponding tables

This precipitates the realization that another thing that I will have to infer somewhere is what properties will have to be changed as a result of explicitly editing others. Namely, targets will need to be added or removed to corresponding classes based on the changes I make.

It also precipitates the realization that it will be difficult to conclude what changes I need to execute while looping over the change list, since changes may override each other (e.g. I don’t have to delete a property on a class if later on in the edit queue I’m deleting the class altogether). This is probably why I thought to pass the complete new state of the schema rather than a list of edits.

How about this - instead of consolidating the representation of the edit into one list, maybe I differentiate it more:

1. List of class creations and deletions, and title/metadata edits
2. List of on-property changes, like deletion/creation, data types, and title or styling
    - explicitly does NOT include targets. they will be populated in 3.
3. List of relation changes, like changing the targets of the properties
    - does NOT include changes implied by class and property deletion. these will be inferred and added when processing #1 and #2
    - DOES include uncreated properties from #2. When going through those changes

This will accomplish a few things:

* normalize the changes into different categories
* establish an order of operations which prevents changes going through that counteract/override each other
    * each step depends to a certain extend on the ones that come before it. e.g. properties of a new class need the ID of the class registered before they are created, and new relationships need the IDs of newly created properties (and classes) in order to be themselves registered.
* prevent information redundancy in the parameters, and the need as a developer to explicitly detail all of the implications of the change that I’m making
* create a validation funnel for any change to the schema; since every change goes through this function, it can be the central location for any validation logic, and you can make either isolated or bulk changes, which are always handled through the same stable procedure

It has one notable drawback:
* I have to create data property columns through ALTER TABLE rather than defining them with their class. But I might have been doing this already? (yes, I am already doing this)

---

Another separate thing that occurs to me, which may be a way of solving the current error without philosophical ponderings, is that what’s actually causing the error is me trying to retrieve the items in a class mid-way through editing the schema, because I call `refresh_class_cache` during the class/property creation process. I think this is either an oversight from when I was last working on this, or an oversight from the past couple days of converting to typescript. I should have two functions:

1. One that refreshes the list of classes (with IDs, titles, metadata), and each of their schemas.
2. One that refreshes the list of items for each of the classes fetched by #1, populating the items array which will be created, empty, in #1.

So in #1, the other thing I will need to do is search the cache before I replace the array to see if that class is already recorded, and copy over the items from the old `ClassData` object to the new one.

---

Other random thoughts:
- maybe I should replace "metadata" everywhere with "attributes"
- maybe rename PropertyDefinition to PropertyConfiguration or PropertyConfig
- could I hypothetically add order to relations? just via an order column in junction tables?
    - I do not think so, because the order would be different for each item
    - _but_ I could potentially add the order as an array of IDs in the property metadata? this would just require a dreaded maneuver, storing the data in multiple places...
    - it could be a JSON column in junction tables keyed by class and prop... but that does sound like a Pain to manage
- could I hypothetically use one-to-many columns in the global table of junctions that identify them with properties and/or classes?

I don’t know if this would implicitly accomplish the above BUT could I just normalize the class and prop IDs in the junction list like so?:

```
| id INTEGER NOT NULL PRIMARY KEY | side_a_class_id INTEGER | side_a_prop_id INTEGER | side_b_class_id INTEGER | side_b_prop_id INTEGER |
FOREIGN KEY(side_a_class_id) REFERENCES system_classlist(id)
FOREIGN KEY(side_b_class_id) REFERENCES system_classlist(id)
```

I guess I have to decide whether to create a global _properties_ table as well, just like objects, which could be the foreign key reference for the property ids. 

- _or..._  do I create a global table for class and prop IDs, such that I can just have side_a and side_b referencing IDs in that table, whether they are classes or properties (okay that might be slightly unhinged)



### Goby technical terminology:

Some rough definitions of the terms that I use in the `goby-database` codebase*. 

Conceptual architecture:

* `item`:
    * an entity possessing `properties`
    * can either be independent
        * represented as a free-floating `block` on a `workspace` canvas
    * ...or belong to a `class`, inheriting the properties it has from said `class`
        * represented as a row in a table
* `class`:
    * the declaration of a kind of `item`, with a user-defined set of properties.
    * represented as a table, which contains all the items belonging to a class
* `property`:
    * some user-defined quality of an `item`, e.g. the title, page length, or genre of a book
    * two kinds:
        * `“data” property`: any kind of raw data, i.e. a string of text, a url, a file path, an image, a number, a data, etcetera.
        * `“relation” property`: a kind of `connection` drawn between items in the database.
            * For example, an “author” property of books which references items in the “author” class.
            * It may involve `relations` to multiple different classes/+properties
* `connection`: 
    * a link of some kind between two `items`
* `relation`:
    * the declaration of a kind of `connection` existing between `items`, mediated through their properties. 
        * For example, in a parent-child relationship, the "parents" property in a child would be linked to the "children" property in a parent
    * **`relation` is to `connection` as `class` is to `item`** 
    * a `junction` is the technical component in SQL by which `connections` belonging to a given `relation` are recorded in the database 

Visual architecture:

* `workspace`:
    * a gridded, spatial canvas on which `items` and `classes` can be represented and edited visually as rectangular cells of mainly text content. 
* `block`: 
    * a discrete object placed somewhere within a workspace
    * typically the visual representation of an `item` or `class` (and its members)




*Unfortunately for now I can’t compose the definitions without resorting to some level of jargon, loosely pulled from my education in philosophy and logic, as well as some level of circularity, owing to the way these terms are constitued by their relation to other terms.


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
    * undo anything (can this be achieved? see _Implementing undo/redo_ below)
        * sqlite has [a page](https://www.sqlite.org/undoredo.html) detailing a method for achieving this
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

### Junction tables (how relations work in goby)

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
                ```
                | id | classA_id.propA_id | classA_id.propA_id | metadata? |
                ```
            * each junction structure:
                ```
                | classA_id.propA_id | classB_id.propB_id |`
                ```
* maybe "count" could be generalized to a "max" condition?
    * although maybe in the interface still making it a toggle between the single and multi-select that people are familiar with
    * this doesn't work because the conditions are supposed to determine candidates for a relation, and if this is a condition then a single select will have no candidates



#### Return format for relation properties:
* for each row, an array of the objects its connected to, in the format: `{class_id:X,prop_id:X,object_id:X}`


#### Structure of SQL request including relation prop structured as JSON array

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

### Window management

After [some considerations](https://www.are.na/block/23294643) about how windows will work in Goby, I’m moving forward with the idea of having the database file store information about windows in a separate table.

Here is what I’m thinking for the table structure:

- `window ID #`
- `type`: `home`/`hopper`/ or `workspace`
	- I’m thinking that there will only be one `home` window and one `hopper` window, added during the init process as IDs #1 and #2 in the table
- `open` : `true`/`false`
	- goby will iterate over this and check if it has to open anything
- `metadata`: `{json}`
	- `.position` (on desktop): `[x,y]`
	- `.dimensions`:`[w,h]`
    - `.type`: (for workspaces) `canvas`/`focus`
	- `.items`:(for workspaces) `[array of objects and tables in this view and their styling meta]`
		- `.position` (in window): `[x,y]`
        - other styling TBD...

---


### Names versus IDs:
* One goal is to make the sql database on its own somewhat legible
* However, without care, names will run amuck and renaming something will require changing the name in a thousand places. 
* Current approach to this for classes and properties is have their names on the actual tables and columns, and their IDs in places where metadata for classes is stored, so at most you only need to change their name in two places

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

### Implementing undo/redo

* This isn’t top of agenda for me right now because it’s really complicated, and based on my current understanding it shouldn’t be too tricky to build into the codebase later on. 
* Undo/redo functionality isn’t built into SQLite, but they do detail a way of technically achieving it [here](https://www.sqlite.org/undoredo.html). I don’t fully understand how it works yet.
* I think a simple first goal, when I do get to this, would be to implement undo/redo when it comes to simple data entry, i.e. changing table cells or adding/deleting entire rows. 
    * Where I’m anticipating this will get messy is when it comes to Goby’s class design, which allows you to design your own table schema. Undoing/redoing changes to table schema is a more complicated thing which probably isn’t accounted for in the customary approach linked above.
    * Moreover, I’m expecting that simple changes like adding an object to a class or changing item styling will be the typical use cases for Command-Z functionality.
    * For class design, I can take advantage of SQLite transactions to provide a brute force way of letting you discard all changes and roll back to a saved state. Maybe the interface can give you some way of “committing” changes, or a way of entering “transaction mode”

- Another thing to consider/look into: is there a way I could integrate this with git somehow, and have a sort of brute-force undo-redo powered by rolling back changes at the raw data level? Reminds me of that thing that happens when you open an indesign file and get a second, temporary file. Could I somehow track changes while you work and live commit them? 

---

### Commands

With my new typescript and package export setup I have some new commands for development, which maybe I ought to record here:

- `npm run build`: runs the typescript compiler on all the files in `src`, adding them to `dist`. 
- `npm run test [test name]`: this is my system for putting all my tests in one file, `sandbox.ts`, and passing in a string parameter with the name of the test to run. My tests so far:

    - `in-memory`: some general tests of goby’s capabilities in an in-memory database 
    - `groceries`: this generates a timestamped project file with recipe and ingredient classes. I’ve been using this test and exporting the file to use as the foundation for my interface development
    - `unit-relation-matching`: my first “unit test”, verifying that one of my more complex utility functions returns expected outputs in a variety of scenarios.



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

### Workspaces in the database

- columns in a generated workspace table:
    - `type` (of thing, e.g. item, class, etc.)
    - `block id` (assigned for workspace purposes, should be integer primary key)
    - `concept id` (item id for `type`='item', class id for `type`='class', etc for any categories I add in the future )
    - `properties` (styling like position and size)

