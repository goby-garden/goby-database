import Database from 'better-sqlite3';
const text_data_types = ['string', 'resource'];
const real_data_types = ['number'];
export default class Project {
    constructor(source) {
        this.class_cache = [];
        this.junction_cache = [];
        this.db = new Database(source);
        //checks if goby has been initialized, initializes if not
        const goby_init = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='system_root'`).get();
        if (!goby_init) {
            console.log('initializing goby database');
            this.init();
        }
        else {
            console.log('opened goby database');
        }
        this.db.function('junction_obj', (side_a, side_b) => {
            let json_string = '';
            if (typeof side_a == 'string' && typeof side_b == 'string') {
                let split_1 = side_a.split('.');
                let split_2 = side_b.split('.');
                let c1 = `"class_id":${split_1[0]}`;
                let p1 = split_1[1] ? `,"prop_id":${split_1[1]}` : '';
                let c2 = `"class_id":${split_2[0]}`;
                let p2 = split_2[1] ? `,"prop_id":${split_2[1]}` : '';
                json_string = `[ {${c1}${p1}}, {${c2}${p2}} ]`;
            }
            else {
                json_string = `[]`;
            }
            // possibly validate output with template literals in the future
            // https://stackoverflow.com/questions/57017145/is-it-possible-to-assign-a-partial-wildcard-to-a-type-in-typescript
            return json_string;
        });
        //prepared statements with arguments so my code isn't as verbose elsewhere
        this.run = {
            begin: this.db.prepare('BEGIN IMMEDIATE'),
            commit: this.db.prepare('COMMIT'),
            rollback: this.db.prepare('ROLLBACK'),
            create_item: this.db.prepare('INSERT INTO system_root(type,value) VALUES (@type, @value)'),
            get_junctionlist: this.db.prepare('SELECT id, junction_obj(side_a, side_b) AS sides, metadata FROM system_junctionlist'),
            get_class: this.db.prepare(`SELECT name, metadata FROM system_classlist WHERE id = ?`),
            get_class_id: this.db.prepare(`SELECT id FROM system_classlist WHERE name = ?`),
            get_all_classes: this.db.prepare(`SELECT id, name, metadata FROM system_classlist`),
            save_class_meta: this.db.prepare(`UPDATE system_classlist set metadata = ? WHERE id = ?`),
            update_window: this.db.prepare(`UPDATE system_windows set open = @open, type=@type, metadata = @meta WHERE id = @id`),
            create_window: this.db.prepare(`INSERT INTO system_windows (type,open, metadata) VALUES (@type, @open, @meta)`),
            get_windows: this.db.prepare(`SELECT id, type, open, metadata FROM system_windows`),
            match_junction: this.db.prepare(`SELECT id, side_a, side_b, metadata FROM system_junctionlist WHERE (side_a = @input_1 AND side_b = @input_2 ) OR ( side_a = @input_2 AND side_b = @input_1 )`),
            fuzzy_match_junction: this.db.prepare(`SELECT id, side_a, side_b, metadata FROM system_junctionlist WHERE (side_a LIKE @input_1 AND side_b LIKE @input_2 ) OR ( side_a LIKE @input_2 AND side_b LIKE @input_1 )`)
        };
        this.class_cache = [];
        this.refresh_class_cache();
        this.junction_cache = [];
        this.refresh_junction_cache();
        // commenting this out until I figure out my transaction / one-step-undo functionality
        //if I understand transactions correctly, a new one will begin with every user action while committing the one before, meaning I'll need to have the first begin here
        // this.run.begin.run();
    }
    get_latest_table_row_id(table_name) {
        let db_get = this.db.prepare(`SELECT last_insert_rowid() AS id FROM ${table_name}`).get();
        // if no row found, silently return null
        if (!db_get)
            return null;
        let id = db_get.id;
        return id;
    }
    init() {
        //System table to contain all items in the project.
        this.create_table('system', 'root', [
            'id INTEGER NOT NULL PRIMARY KEY',
            'type TEXT',
            'value TEXT'
        ]);
        //System table to contain metadata for all classes created by user
        this.create_table('system', 'classlist', ['id INTEGER NOT NULL PRIMARY KEY', 'name TEXT', 'metadata TEXT']);
        //System table to contain all the junction tables and aggregate info about relations
        this.create_table('system', 'junctionlist', ['id INTEGER NOT NULL PRIMARY KEY', 'side_a TEXT', 'side_b TEXT', 'metadata TEXT']);
        //System table to contain generated image data
        this.create_table('system', 'images', ['file_path TEXT', 'img_type TEXT', 'img BLOB']);
        // window "open" is a boolean stored as 0 or 1
        this.create_table('system', 'windows', [
            'id INTEGER NOT NULL PRIMARY KEY',
            'type TEXT',
            'open INTEGER',
            'metadata TEXT'
        ]);
        this.db.prepare(`INSERT INTO system_windows 
            (type, open, metadata) 
            VALUES 
            ('home',0,'${JSON.stringify({ pos: [null, null], size: [540, 400] })}'),
            ('hopper',0,'${JSON.stringify({ pos: [null, null], size: [300, 400] })}')`).run();
        // [TO ADD: special junction table for root items to reference themselves in individual relation]
        this.create_table('system', 'junction_root', [
            'id_1 INTEGER',
            'id_2 INTEGER',
            'metadata TEXT'
        ]);
    }
    refresh_class_cache() {
        let class_array = this.retrieve_all_classes();
        let cache_array = [];
        for (let class_data of class_array) {
            cache_array.push(class_data);
        }
        this.class_cache = cache_array;
    }
    refresh_junction_cache() {
        let junction_list = this.get_junctions();
        this.junction_cache = junction_list;
    }
    create_table(type, name, columns) {
        //type will pass in 'class', 'system', or 'junction' to use as a name prefix
        //columns is an array of raw SQL column strings
        let columns_string = columns.join(',');
        //brackets to allow special characters in user-defined names
        // validation test: what happens if there are brackets in the name?
        const sqlname = type == 'class' ? `[class_${name}]` : `${type}_${name}`;
        let create_statement = `CREATE TABLE ${sqlname}(
          ${columns_string}
        )`;
        this.db.prepare(create_statement).run();
    }
    action_create_class(name) {
        var _a;
        //a class starts with these basic columns
        let columns = [
            'system_id INTEGER UNIQUE',
            'system_order REAL',
            'user_name TEXT',
            `FOREIGN KEY(system_id) REFERENCES system_root(id)`
        ];
        this.create_table('class', name, columns);
        const class_meta = {
            properties: [
                {
                    name: 'name',
                    type: 'data',
                    id: 1,
                    data_type: 'string',
                    max_values: 1,
                }
            ],
            used_prop_ids: [1],
            style: {
                color: '#b5ffd5'
            }
        };
        this.db.prepare(`INSERT INTO system_classlist (name, metadata) VALUES ('${name}','${JSON.stringify(class_meta)}')`).run();
        //get the id of newest value from system_classlist and return
        const class_id = (_a = this.db.prepare('SELECT id FROM system_classlist ORDER BY id DESC').get()) === null || _a === void 0 ? void 0 : _a.id;
        if (class_id == undefined)
            throw new Error('Something went wrong when generating new class.');
        // NOTE: in the future, do not declare properties in the metadata. instead, create a properties table for the class and register them there as rows. this may cause a chicken and egg problem though, if I need the property IDs for the class and the class ID for the props.
        // maybe if I keep this deterministic, and wait for a further step to add user-defined properties, I'll always know the IDs in the newly created property table, i.e. name, whose ID will presumably just be 1.
        this.refresh_class_cache();
        this.refresh_junction_cache();
        return class_id;
    }
    action_add_data_property({ class_id, name, data_type, max_values }) {
        let class_data = this.class_cache.find(a => a.id == class_id);
        if (class_data == undefined)
            throw new Error('Cannot find class in class list.');
        let class_name = class_data.name;
        let class_meta = class_data.metadata;
        // NOTE: replace with code to add row to a property table ----------
        let id = Math.max(...class_meta.used_prop_ids) + 1;
        class_meta.used_prop_ids.push(id);
        //create JSON for storage in system_classlist
        const prop_meta = { type: 'data', name, max_values, data_type, id };
        //add property to property list 
        class_meta.properties.push(prop_meta);
        // ------------------------------
        let sql_data_type = '';
        if (max_values > 1 || text_data_types.includes(data_type)) {
            //multiple for data means a stringified array no matter what it is
            sql_data_type = 'TEXT';
        }
        else if (real_data_types.includes(data_type)) {
            sql_data_type = 'REAL';
        }
        //create property in table
        let command_string = `ALTER TABLE [class_${class_name}] ADD COLUMN [user_${name}] ${sql_data_type};`;
        this.db.prepare(command_string).run();
        //update metadata json for table with new property
        this.run.save_class_meta.run(JSON.stringify(class_meta), class_id);
        this.refresh_class_cache();
    }
    action_add_relation_property(class_id, name, max_values) {
        var _a;
        // basic property construction------------------
        let class_meta = (_a = this.class_cache.find(a => a.id == class_id)) === null || _a === void 0 ? void 0 : _a.metadata;
        if (class_meta == undefined)
            throw new Error('Cannot find class in class list.');
        let id = Math.max(...class_meta.used_prop_ids) + 1;
        class_meta.used_prop_ids.push(id);
        // NOTE: in the future, register the property in a property table instead-----------------
        //create JSON for storage in system_classlist
        const prop_meta = {
            type: 'relation',
            name,
            id,
            max_values,
            relation_targets: [],
        };
        //add property to property list 
        class_meta.properties.push(prop_meta);
        this.run.save_class_meta.run(JSON.stringify(class_meta), class_id);
        // -------------------------------------------------
        this.refresh_class_cache();
        // WONDERING WHERE THE TARGET / JUNCTION TABLE HANDLING LOGIC IS?
        // I believe that this function is not intended to be used standalone, but rather as a part of 
        // action_edit_class_schema, which handles relation changes/additions concurrently for all the classes they affect.
        // I should make sure class item retrieval doesn't break if a relation prop has no targets though (it should just produce empty arrays)
        return id;
    }
    delete_property(class_id, prop_id) {
        //this function is meant to be used within a flow where the relations that need to change as a result of this deletion are already kept track of
        var _a;
        let class_meta = (_a = this.class_cache.find(a => a.id == class_id)) === null || _a === void 0 ? void 0 : _a.metadata;
        if (!class_meta)
            throw new Error('Cannot locate class to delete property from.');
        // NOTE: instead of this array splicing, in the future this should modify a SQL table for properties
        let i = class_meta.properties.findIndex(a => a.id == prop_id);
        class_meta.properties.splice(i, 1);
        this.run.save_class_meta.run(JSON.stringify(class_meta), class_id);
        this.refresh_class_cache();
    }
    get_junctions() {
        let junction_list_sql = this.run.get_junctionlist.all();
        let junction_list_parsed = junction_list_sql.map(a => {
            let sides = JSON.parse(a.sides);
            return Object.assign(Object.assign({}, a), { sides });
        });
        return junction_list_parsed;
    }
    action_edit_class_schema(edits) {
        // class_changes=[],new_junction_list
        let class_changes = edits.class_changes || [];
        let staged_junctions = edits.staged_junctions;
        // really these just cover class and property add/drop right now. I could possibly add an edit existing option, not sure if the right place to do edits to relation_targets is here or in the update_relations fn.
        for (let change of class_changes) {
            // creates a class, property, or both, inferring based on the information is provided.
            if (change.action == 'create') {
                // create a class if there’s no ID set, and a name to register
                if (!change.class_id && change.class_name) {
                    // create class
                    change.class_id = this.action_create_class(change.class_name);
                    // if there are new relationships involving this new class,
                    // set the class_id you just created
                    if (staged_junctions && change.class_id !== undefined) {
                        staged_junctions.map(junction => {
                            let matching = junction.sides.find(side => side.class_name == change.class_name);
                            if (matching)
                                matching.class_id = change.class_id; // needs "as number" bc of ts scoping I guess?
                        });
                    }
                }
                // if there’s a prop_name listed, we know that needs to be created
                if ("prop_name" in change && change.class_id !== undefined) {
                    if (change.type == 'relation') {
                        // register the property
                        change.prop_id = this.action_add_relation_property(change.class_id, change.prop_name, change.max_values);
                        // same as class find any relationships in the junction list that involve this new property
                        // and set the ID accordingly
                        if (staged_junctions) {
                            staged_junctions.map(junction => {
                                let matching = junction.sides.find(side => side.class_id == change.class_id && side.prop_name == change.prop_name);
                                if (matching)
                                    matching.prop_id = change.prop_id;
                            });
                        }
                    }
                    else if (change.type == 'data') {
                        this.action_add_data_property({
                            class_id: change.class_id,
                            name: change.prop_name,
                            data_type: change.data_type,
                            max_values: change.max_values
                        });
                    }
                }
            }
            else if (change.action == 'delete') {
                if (change.subject == 'property') {
                    this.delete_property(change.class_id, change.prop_id);
                }
                else if (change.subject == 'class') {
                    this.action_delete_class(change.class_id);
                }
                // I need to be able to resolve relations that involve the deleted classes and properties, i.e.
                // - remove them as targets from other relation properties
                // - delete any junction tables in which they participate
                // maybe it's worthwhile and safe to just check the junction list for any relations that include this property or class, and remove them/convert them if necessary?
            }
        }
        if (staged_junctions !== undefined) {
            // type guard to make sure each side has at least a class_id defined
            let validSides = (junction) => {
                let j = junction;
                return j.sides[0].class_id !== undefined && j.sides[1].class_id !== undefined;
            };
            // using type guard to filter out discrepancies
            let staged_junctions_with_valid_sides = staged_junctions.filter(junction => validSides(junction));
            // (if this actually filtered something out, then something weird is going on)
            if (staged_junctions.length !== staged_junctions_with_valid_sides.length)
                throw Error("There are junctions with no corresponding class; something in the inputted schema is invalid.");
            this.action_update_relations(staged_junctions_with_valid_sides);
        }
        //in the middle of adding update_relations to this generalized funciton
    }
    action_delete_class(class_id) {
        // TBD
        console.log('TBD, class deletion not yet implemented');
    }
    action_update_relations(junction_list) {
        let classes_meta = this.class_cache;
        // STEP 1 ============================
        // find all the old junctions which don't appear in the new list
        // add them to a "delete_queue" to schedule them for deletion
        // remove the corresponding targets from the properties they reference
        let modified_classes = [];
        let delete_queue = [];
        let old_junction_list = this.get_junctions();
        for (let junction of old_junction_list) {
            let s1 = junction.sides[0];
            let s2 = junction.sides[1];
            let matching = junction_list.find(a => junction_match(a.sides, junction.sides));
            if (matching == undefined) {
                if (s1.prop_id)
                    remove_target(s1, s2);
                if (s2.prop_id)
                    remove_target(s2, s1);
                delete_queue.push(junction);
            }
            //delete queue junctions will need to have the targets removed (or left be, if the prop target doesn't match) from their respective props
        }
        // STEP 2 ============================
        // a) find all the junctions in the new list that don't appear in the old one
        // b) this means they need to be newly created
        // c) the corresponding targets need to be registered in any referenced properties
        // d) we check if there are any former tables which share at least one of the same properties, and we transfer their properties
        for (let junction of junction_list) {
            let s1 = junction.sides[0];
            let s2 = junction.sides[1];
            // a)
            let matching = old_junction_list.find(a => junction_match(a.sides, junction.sides));
            if (matching == undefined) {
                // b)
                // create the new table
                let j_sides = {
                    input_1: `${s1.class_id}.${s1.prop_id || ''}`,
                    input_2: `${s2.class_id}.${s2.prop_id || ''}`
                };
                let junction_id = this.create_junction_table(j_sides);
                // c)
                if (s1.prop_id)
                    add_target(s1, s2, junction_id);
                if (s2.prop_id)
                    add_target(s2, s1, junction_id);
                let j_object = {
                    side_a: j_sides.input_1,
                    side_b: j_sides.input_2,
                    id: junction_id
                };
                // d)
                // look for any tables in the delete pile that pair the same classes and have the same property on one side. If any exist, transfer the connections from the old tables
                let partial_matches = delete_queue.filter(a => partial_junction_match(a.sides, junction.sides));
                for (let partial of partial_matches) {
                    let p_object = {
                        id: partial.id,
                        side_a: `${partial.sides[0].class_id}.${partial.sides[0].prop_id || ''}`,
                        side_b: `${partial.sides[1].class_id}.${partial.sides[1].prop_id || ''}`
                    };
                    this.transfer_connections(p_object, j_object);
                }
            }
        }
        // STEP 3 ============================ 
        // delete the tables in the delete pile
        for (let junction of delete_queue) {
            this.delete_junction_table(junction.id);
        }
        // STEP 4 ============================ 
        // submit all prop updates to class_meta
        // NOTE: in the future this should write back to the property table instead of modifying classes?
        for (let modified of modified_classes)
            this.run.save_class_meta.run(JSON.stringify(modified.metadata), modified.id);
        this.refresh_class_cache();
        // STEP 5 (TBD) ===================
        // check if the connections in the new tables follow the conditons of their corresponding properties, and remove any that don't pass muster
        // ======================== utility functions ============================
        function side_match(x, y) {
            return x.class_id == y.class_id && x.prop_id == y.prop_id;
        }
        ;
        function junction_match(a, b) {
            // match sides completely, order doesn't matter
            return (side_match(a[0], b[0]) && side_match(a[1], b[1])) ||
                (side_match(a[0], b[1]) && side_match(a[1], b[0]));
        }
        function partial_junction_match(a, b) {
            // match both classes
            // match at least one prop
            let a0_match_i = b.findIndex(side => a[0].class_id == side.class_id);
            let a1_match_i = b.findIndex(side => a[1].class_id == side.class_id);
            if (a0_match_i >= 0 && a1_match_i >= 0 && a0_match_i !== a1_match_i) {
                return b[a0_match_i].prop_id == a[0].prop_id ||
                    b[a1_match_i].prop_id == a[1].prop_id;
            }
            else {
                return false;
            }
        }
        function remove_target(prop, target) {
            let prop_class = classes_meta[prop.class_id];
            let class_meta = prop_class.metadata;
            let prop_meta = class_meta.properties.find(a => a.id == prop.prop_id);
            if (prop_meta && prop_meta.type == 'relation') {
                let target_index = prop_meta.relation_targets.findIndex(a => side_match(a, target));
                if (target_index >= 0)
                    prop_meta.relation_targets.splice(target_index, 1);
                if (!modified_classes.find((c) => c.id == prop_class.id))
                    modified_classes.push(prop_class);
            }
        }
        function add_target(prop, target, junction_id) {
            let prop_class = classes_meta[prop.class_id];
            let class_meta = prop_class.metadata;
            let prop_meta = class_meta.properties.find(a => a.id == prop.prop_id);
            if (prop_meta && prop_meta.type == 'relation') {
                prop_meta.relation_targets.push(target);
                // NOTE: same as above, there’s a better way to handle without mutating
                if (!modified_classes.find((c) => c.id == prop_class.id))
                    modified_classes.push(prop_class);
            }
        }
    }
    create_junction_table(sides) {
        // NOTE: in the future I think I'm inclined to store sides as JSON, i.e. {class_id:2,prop_id:1} - slightly more verbose, but a lot more readable and less weird and arbitrary (lol why did I do it in this syntax...)
        // UPDATE: I think I used this syntax because I need a way to refer to it in junction table column names. but there must be a better way... maybe the column names can always be "side a" and "side b" with the actual props encoded in theh junction list. that seems right.
        var _a;
        // adds new record to junction table
        this.db.prepare(`INSERT INTO system_junctionlist (side_a, side_b) VALUES ('${sides.input_1}','${sides.input_2}')`).run();
        //gets id of new record
        let id = (_a = this.db.prepare('SELECT id FROM system_junctionlist ORDER BY id DESC').get()) === null || _a === void 0 ? void 0 : _a.id;
        if (typeof id !== 'number')
            throw new Error('Something went wrong creating a new relationship');
        // creates table
        this.create_table('junction', id, [
            `"${sides.input_1}" INTEGER`,
            `"${sides.input_2}" INTEGER`
        ]);
        return id;
    }
    transfer_connections(source, target) {
        let source_relations = this.db.prepare(`SELECT * FROM junction_${source.id}`).all();
        //have to match source sides to target sides in order to determine junction order
        let source_sides = source.side_a.split('.')[0] == target.side_a.split('.')[0] ?
            [source.side_a, source.side_b] : [source.side_b, source.side_a];
        for (let relation of source_relations) {
            this.db.prepare(`INSERT INTO junction_${target.id}("${target.side_a}","${target.side_b}") 
            VALUES(${relation[source_sides[0]]},${relation[source_sides[1]]})`).run();
        }
    }
    delete_junction_table(id) {
        this.db.prepare(`DELETE FROM system_junctionlist WHERE id = ${id}`).run();
        this.db.prepare(`DROP TABLE junction_${id}`).run();
    }
    check_conditions({ class_id, prop_id, property, class_data }) {
        /*
        (some early ideas for how the conditions look;for now not gonna deal with filters or rules, just going to check max_values)
        conditions={
            filters:[

            ],
            rules:[

            ]
        }
        */
        if (class_id !== undefined && !class_data) {
            class_data = this.retrieve_class({ class_id });
        }
        if (prop_id !== undefined && !property) {
            // NOTE: change this in the future when properties moved to table
            property = class_data.metadata.properties.find(a => a.id == prop_id);
        }
        if (property == undefined)
            throw new Error('Could not locate property');
        let prop_name = 'user_' + property.name;
        for (let item of class_data.items) {
            let prop_values = item[prop_name];
            // check if they follow the conditions, and adjust if not.
            // for now I think just check max_values, and trim the values if not
            // I think (?) I can just read from the output of the cached class data,
            // and then use a prepare statement to modify data props on this table, and relation props on the corresponding junction table
            console.log(prop_name, prop_values);
        }
        // after everything is done I should probably refresh the cache to get any changes to the items; maybe that can happen in the function where this is invoked though.
    }
    action_save() {
        if (this.db.inTransaction)
            this.run.commit.run();
        this.db.close();
    }
    action_create_item_in_root({ type = null, value = '' }) {
        var _a;
        // this.db.prepare('INSERT INTO system_root VALUES (null)').run();
        this.run.create_item.run({ type, value });
        let id = (_a = this.db.prepare('SELECT id FROM system_root ORDER BY id DESC').get()) === null || _a === void 0 ? void 0 : _a.id;
        if (typeof id !== 'number')
            throw new Error('Something went wrong creating a new item');
        return id;
    }
    action_delete_item_from_root(id) {
        this.db.prepare(`DELETE FROM system_root WHERE id = ${id}`).run();
    }
    action_set_root_item_value(id, value) {
        this.db.prepare(`UPDATE system_root set value = ? WHERE id = ?`).run(value, id);
    }
    action_add_row(class_id) {
        let class_data = this.class_cache.find(a => a.id == class_id);
        if (class_data == undefined)
            throw new Error('Cannot find class in class list.');
        let class_name = class_data.name;
        //first add new row to root and get id
        const root_id = this.action_create_item_in_root({ type: 'class_' + class_id });
        //get the last item in class table order and use it to get the order for the new item
        const last_ordered_item = this.db.prepare(`SELECT system_order FROM [class_${class_name}] ORDER BY system_order DESC`).get();
        const new_order = last_ordered_item ? last_ordered_item.system_order + 1000 : 0;
        this.db.prepare(`INSERT INTO [class_${class_name}] (system_id, system_order) VALUES (${root_id},${new_order})`).run();
        return root_id;
    }
    action_make_relation(input_1, input_2) {
        /* input = {
            class_id: INT,
            prop_id: INT,
            item_id: INT
        }
        */
        var _a;
        // NOTE this will all need to change if I convert the junction syntax to JSON --------
        let sides = {
            input_1: `${input_1.class_id}.${input_1.prop_id || ''}`,
            input_2: `${input_2.class_id}.${input_2.prop_id || ''}`
        };
        let junction_id = (_a = this.run.match_junction.get(sides)) === null || _a === void 0 ? void 0 : _a.id;
        this.db.prepare(`INSERT INTO junction_${junction_id} ("${sides.input_1}", "${sides.input_2}") VALUES (${input_1.item_id},${input_2.item_id})`).run();
        // -------------------
    }
    retrieve_class({ class_id, class_name, class_meta }) {
        var _a;
        if (class_name == undefined || class_meta == undefined) {
            let class_data = this.class_cache.find(a => a.id == class_id);
            if (class_data == undefined)
                throw new Error('Cannot find class in class list.');
            class_name = class_data.name;
            class_meta = class_data.metadata;
        }
        ;
        const class_string = `[class_${class_name}]`;
        // //joined+added at beginning of the query, built from relations
        const cte_strings = [];
        // //joined+added near the end of the query, built from relations
        const cte_joins = [];
        // //joined+added between SELECT and FROM, built from relations
        const relation_selections = [];
        let relation_properties = class_meta.properties.filter(a => a.type == 'relation');
        for (let prop of relation_properties) {
            const target_selects = [];
            const target_joins = [];
            let p_side = `${class_id}.${prop.id}`;
            let first = prop.relation_targets[0];
            for (let i = 0; i < prop.relation_targets.length; i++) {
                let target = prop.relation_targets[i];
                let t_side = `${target.class_id}.${target.prop_id || ''}`;
                let junction_id = (_a = this.run.match_junction.get({
                    input_1: p_side,
                    input_2: t_side
                })) === null || _a === void 0 ? void 0 : _a.id;
                if (junction_id == undefined)
                    throw new Error(`Could not find relation data associated with ${class_name}.${prop.name}`);
                let target_select = `SELECT "${p_side}", json_object('target_id','${target.class_id}','id',"${t_side}") AS json_object
                FROM junction_${junction_id}`;
                target_selects.push(target_select);
            }
            const cte = `[${prop.id}_cte] AS (
                SELECT "${p_side}", ('[' || GROUP_CONCAT(json_object,',') || ']') AS [user_${prop.name}]
                FROM (${target_selects.join(' UNION ')})
                GROUP BY "${p_side}"
            )`;
            cte_strings.push(cte);
            relation_selections.push(`[${prop.id}_cte].[user_${prop.name}]`);
            cte_joins.push(`LEFT JOIN [${prop.id}_cte] ON [${prop.id}_cte]."${p_side}" = ${class_string}.system_id`);
        }
        let orderby = `ORDER BY ${class_string}.system_order`;
        let query = `
            ${cte_strings.length > 0 ? "WITH " + cte_strings.join(',') : ''}
            SELECT [class_${class_name}].* ${cte_strings.length > 0 ? ', ' + relation_selections.join(`, `) : ''}
            FROM [class_${class_name}]
            ${cte_joins.join(' ')}
            ${orderby}`;
        console.log('query:\n', query);
        // possibly elaborate this any type a little more in the future, e.g. a CellValue or SQLCellValue type that expects some wildcards
        let items = this.db.prepare(query).all();
        let stringified_properties = class_meta.properties.filter(a => a.type == 'relation' || a.max_values > 1);
        items.map((row) => {
            if (row && typeof row == 'object') {
                for (let prop of stringified_properties) {
                    let prop_sql_name = 'user_' + prop.name;
                    if (prop_sql_name in row) {
                        row[prop_sql_name] = JSON.parse(row[prop_sql_name]);
                    }
                }
            }
        });
        return {
            id: class_id,
            items,
            metadata: class_meta,
            name: class_name
        };
    }
    retrieve_all_classes() {
        const classes_data = this.run.get_all_classes.all();
        // console.log(classes)
        let classes = [];
        for (let cls of classes_data) {
            classes.push(this.retrieve_class({ class_id: cls.id, class_name: cls.name, class_meta: JSON.parse(cls.metadata) }));
        }
        return classes;
    }
    retrieve_windows() {
        let windows = this.run.get_windows.all();
        windows.map(a => a.metadata = JSON.parse(a.metadata));
        return windows;
    }
    retrieve_workspace_contents(id) {
        // get the workspace table
        let blocks = this.db.prepare(`SELECT * FROM workspace_${id}`).all();
        let blocks_parsed = blocks.map(a => (Object.assign(Object.assign({}, a), { metadata: JSON.parse(a.metadata) })));
        // for(let block of blocks) block.metadata=JSON.parse(block.metadata);
        // get any relevant root items
        let items = this.db.prepare(`SELECT system_root.* 
            FROM system_root 
            LEFT JOIN workspace_${id} 
            ON system_root.id = workspace_${id}.thing_id
            WHERE workspace_${id}.type = 'item';
        `).all();
        // get any relevant classes (going to hold off from this for now)
        return {
            blocks_parsed,
            items
        };
    }
    action_config_window({ type, open, metadata = { pos: [null, null], size: [1000, 700] }, id }) {
        if (id !== undefined) {
            this.run.update_window.run({
                id,
                open,
                type,
                meta: JSON.stringify(metadata)
            });
        }
        else {
            let id = this.create_workspace(open, metadata);
            return id;
        }
    }
    create_workspace(open, metadata) {
        this.run.create_window.run({
            type: 'workspace',
            open,
            meta: JSON.stringify(metadata)
        });
        let id = this.get_latest_table_row_id('system_windows');
        if (!id)
            throw Error('Something went wrong creating the window.');
        this.create_table('workspace', id, [
            'block_id INTEGER NOT NULL PRIMARY KEY',
            'type TEXT',
            'metadata TEXT',
            'thing_id INTEGER'
        ]);
        return id;
    }
    action_create_workspace_block({ workspace_id, thing_type, block_metadata, thing_id }) {
        var _a;
        // should return block id
        this.db.prepare(`INSERT INTO workspace_${workspace_id}(type,metadata,thing_id) VALUES (@type,@metadata,@thing_id)`).run({
            type: thing_type,
            metadata: JSON.stringify(block_metadata),
            thing_id
        });
        let block_id = (_a = this.db.prepare(`SELECT block_id FROM workspace_${workspace_id} ORDER BY block_id DESC`).get()) === null || _a === void 0 ? void 0 : _a.block_id;
        if (block_id == undefined)
            throw Error("Problem adding block to workspace");
        return block_id;
    }
    action_remove_workspace_block({ workspace_id, block_id }) {
        this.db.prepare(`DELETE FROM workspace_${workspace_id} WHERE block_id = ${block_id}`).run();
    }
    ;
    action_create_and_add_to_workspace({ workspace_id, thing_type, block_metadata, thing_data }) {
        let thing_id;
        // thing creation
        switch (thing_type) {
            case 'item':
                let { value: item_value, type: item_type } = thing_data;
                thing_id = this.action_create_item_in_root({ type: item_type, value: item_value });
                break;
            // add cases for class and anything else in the future
        }
        if (!thing_id)
            throw Error('Something went wrong saving an item from a workspace');
        let block_id = this.action_create_workspace_block({
            workspace_id,
            thing_type,
            block_metadata,
            thing_id
        });
        return {
            thing_id,
            block_id
        };
        // should return the block id and item id
    }
    action_remove_from_workspace_and_delete(workspace_id, block_id, thing_type, thing_id) {
        this.action_remove_workspace_block({ workspace_id, block_id });
        switch (thing_type) {
            case 'item':
                this.action_delete_item_from_root(thing_id);
                break;
        }
    }
}
//# sourceMappingURL=index.js.map