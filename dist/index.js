import Database from 'better-sqlite3';
import { defined, partial_relation_match, full_relation_match, can_have_multiple_values, junction_col_name } from './utils.js';
const text_data_types = ['string', 'resource'];
const real_data_types = ['number'];
export default class Project {
    constructor(source) {
        this.class_cache = [];
        this.item_cache = [];
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
        //prepared statements with arguments so my code isn't as verbose elsewhere
        this.run = {
            begin: this.db.prepare('BEGIN IMMEDIATE'),
            commit: this.db.prepare('COMMIT'),
            rollback: this.db.prepare('ROLLBACK'),
            create_item: this.db.prepare('INSERT INTO system_root(type,value) VALUES (@type, @value)'),
            get_junctionlist: this.db.prepare(`
                SELECT 
                id, 
                json_array( 
                    json_object('class_id',side_0_class_id,'prop_id',side_0_prop_id), 
                    json_object('class_id',side_1_class_id,'prop_id',side_1_prop_id)
                ) AS sides, 
                metadata FROM system_junctionlist`),
            get_junctions_matching_property: this.db.prepare(`
                SELECT 
                    id, 
                    json_array( 
                        json_object('class_id',side_0_class_id,'prop_id',side_0_prop_id), 
                        json_object('class_id',side_1_class_id,'prop_id',side_1_prop_id)
                    ) AS sides, 
                    metadata 
                FROM system_junctionlist 
                WHERE (side_0_class_id = @class_id AND side_0_prop_id = @prop_id)
                OR (side_1_class_id = @class_id AND side_1_prop_id = @prop_id)
            `),
            get_class: this.db.prepare(`SELECT name, metadata FROM system_classlist WHERE id = ?`),
            get_class_id: this.db.prepare(`SELECT id FROM system_classlist WHERE name = ?`),
            get_all_classes: this.db.prepare(`SELECT id, name, metadata FROM system_classlist`),
            save_class_meta: this.db.prepare(`UPDATE system_classlist set metadata = ? WHERE id = ?`),
            update_window: this.db.prepare(`UPDATE system_windows set open = @open, type=@type, metadata = @meta WHERE id = @id`),
            create_window: this.db.prepare(`INSERT INTO system_windows (type,open, metadata) VALUES (@type, @open, @meta)`),
            get_windows: this.db.prepare(`SELECT id, type, open, metadata FROM system_windows`)
        };
        this.refresh_caches(['classlist', 'items', 'junctions']);
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
        this.create_table('system', 'junctionlist', [
            'id INTEGER NOT NULL PRIMARY KEY',
            'side_0_class_id INTEGER NOT NULL',
            'side_0_prop_id INTEGER',
            'side_1_class_id INTEGER NOT NULL',
            'side_1_prop_id INTEGER',
            'metadata TEXT'
        ]);
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
    refresh_caches(caches) {
        if (caches.includes('classlist')) {
            this.class_cache = this.retrieve_all_classes();
        }
        if (caches.includes('items')) {
            let refreshed_items = [];
            for (let class_data of this.class_cache) {
                let items = this.retrieve_class_items({ class_id: class_data.id });
                refreshed_items.push({
                    class_id: class_data.id,
                    items
                });
                class_data.items = items;
            }
            this.item_cache = refreshed_items;
        }
        if (caches.includes('junctions')) {
            this.junction_cache = this.get_junctions();
        }
    }
    create_table(type, name, columns) {
        //type will pass in 'class', 'system', or 'junction' to use as a name prefix
        //columns is an array of raw SQL column strings
        let columns_string = columns.join(',');
        //brackets to allow special characters in user-defined names
        // validation test: what happens if there are brackets in the name?
        const sqlname = type == 'class' ? `[class_${name}]` : type == 'properties' ? `class_${name}_properties` : `${type}_${name}`;
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
        // properties:[
        //     {
        //         name:'name',
        //         type:'data',
        //         id:1,
        //         data_type:'string',
        //         max_values:1,
        //     }
        // ],
        const class_meta = {
            style: {
                color: '#b5ffd5'
            }
        };
        this.db.prepare(`INSERT INTO system_classlist (name, metadata) VALUES ('${name}','${JSON.stringify(class_meta)}')`).run();
        //get the id of newest value from system_classlist and return
        const class_id = (_a = this.db.prepare('SELECT id FROM system_classlist ORDER BY id DESC').get()) === null || _a === void 0 ? void 0 : _a.id;
        if (class_id == undefined)
            throw new Error('Something went wrong when generating new class.');
        this.create_table('properties', class_id, [
            `id INTEGER NOT NULL PRIMARY KEY`,
            `name TEXT NOT NULL`,
            `type`,
            `data_type TEXT`,
            `max_values INTEGER`,
            `metadata TEXT`
        ]);
        this.refresh_caches(['classlist']);
        this.action_add_data_property({ class_id, name: 'name', data_type: 'string', max_values: 1, create_column: false });
        // NOTE: in the future, do not declare properties in the metadata. instead, create a properties table for the class and register them there as rows. this may cause a chicken and egg problem though, if I need the property IDs for the class and the class ID for the props.
        // maybe if I keep this deterministic, and wait for a further step to add user-defined properties, I'll always know the IDs in the newly created property table, i.e. name, whose ID will presumably just be 1.
        return class_id;
    }
    action_add_data_property({ class_id, name, data_type, max_values, create_column = true }) {
        // 1. Add property to property table  ---------------------------------------------------
        let property_table = `class_${class_id}_properties`;
        this.db.prepare(`INSERT INTO ${property_table} (name,type,data_type,max_values,metadata) VALUES (@name,@type,@data_type,@max_values,@metadata)`).run({
            name,
            type: 'data',
            data_type,
            max_values,
            metadata: '{}'
        });
        // let prop_id=this.get_latest_table_row_id(property_table);
        // 2. Add column to class table ------------------------------------------------
        if (create_column) {
            let class_data = this.class_cache.find(a => a.id == class_id);
            if (class_data == undefined)
                throw new Error('Cannot find class in class list.');
            let class_name = class_data.name;
            let sql_data_type = '';
            if (can_have_multiple_values(max_values) || text_data_types.includes(data_type)) {
                //multiple for data means a stringified array no matter what it is
                sql_data_type = 'TEXT';
            }
            else if (real_data_types.includes(data_type)) {
                sql_data_type = 'REAL';
            }
            //create property in table
            let command_string = `ALTER TABLE [class_${class_name}] ADD COLUMN [user_${name}] ${sql_data_type};`;
            this.db.prepare(command_string).run();
        }
        this.refresh_caches(['classlist']);
    }
    action_add_relation_property(class_id, name, max_values) {
        let property_table = `class_${class_id}_properties`;
        this.db.prepare(`INSERT INTO ${property_table} (name,type,max_values,metadata) VALUES (@name,@type,@max_values,@metadata)`).run({
            name,
            type: 'relation',
            max_values,
            metadata: '{}'
        });
        let prop_id = this.get_latest_table_row_id(property_table);
        if (defined(prop_id)) {
            this.refresh_caches(['classlist']);
            return prop_id;
        }
        else {
            throw Error('Something went wrong registering a property for the class');
        }
        // WONDERING WHERE THE RELATIONSHIP TARGET LOGIC IS?
        // this info is not stored directly on the property, but as a relationship/junction record
        // this is processed in action_edit_class_schema, which handles relation changes/additions concurrently for all the classes they affect.
    }
    delete_property(class_id, prop_id) {
        //this function is meant to be used within a flow where the relations that need to change as a result of this deletion are already kept track of
        let class_data = this.class_cache.find(a => a.id == class_id);
        if (!class_data)
            throw new Error('Cannot locate class to delete property from.');
        // NOTE: instead of this array splicing, in the future this should modify a SQL table for properties
        // NOTE: I need to check the metadata, and if it's a data property, I need also an ALTER TABLE statement here to delete the column
        let i = class_data.properties.findIndex(a => a.id == prop_id);
        class_data.properties.splice(i, 1);
        this.run.save_class_meta.run(JSON.stringify(class_data), class_id);
        this.refresh_caches(['classlist']);
    }
    get_junctions() {
        let junction_list_sql = this.run.get_junctionlist.all();
        let junction_list_parsed = junction_list_sql.map(a => {
            let sides = JSON.parse(a.sides);
            return Object.assign(Object.assign({}, a), { sides });
        });
        return junction_list_parsed;
    }
    action_edit_class_schema({ class_edits = [], property_edits = [], relationship_edits = [] }) {
        var _a, _b;
        // get the list of existing relationships
        let existing_junctions = this.get_junctions();
        // loop over class changes and make/queue them as needed
        for (let class_edit of class_edits) {
            switch (class_edit.type) {
                case 'create':
                    // NOTE: in the future, check and enforce that the class name is unique
                    // register the class and get the ID
                    let class_id = this.action_create_class(class_edit.class_name);
                    // find all the properties which reference this new class name, and set the class_id.
                    for (let prop_edit of property_edits) {
                        // only a newly created prop would be missing a class id
                        if (prop_edit.type == 'create') {
                            if ((!defined(prop_edit.class_id)) &&
                                prop_edit.class_name == class_edit.class_name) {
                                prop_edit.class_id = class_id;
                            }
                        }
                    }
                    // do the same for relations
                    for (let relationship_edit of relationship_edits) {
                        if (relationship_edit.type == 'create' || relationship_edit.type == 'transfer') {
                            for (let side of relationship_edit.sides) {
                                if (!side.class_id && side.class_name == class_edit.class_name) {
                                    side.class_id = class_id;
                                }
                            }
                        }
                    }
                    break;
                case 'delete':
                    if (class_edit.class_id) {
                        this.action_delete_class(class_edit.class_id);
                        // look for any relationships which will be affected by the deletion of this class, and queue deletion
                        for (let junction of existing_junctions) {
                            if (junction.sides.some(s => s.class_id == class_edit.class_id)) {
                                relationship_edits.push({
                                    type: 'delete',
                                    id: junction.id
                                });
                            }
                        }
                    }
                    else {
                        throw Error("ID for class to delete not provided");
                    }
                    break;
                case 'modify_attribute':
                    // TBD, will come back to this after relation stuff is sorted
                    // this should be harmless, just key into the attribute of metadata and set the value as desired
                    break;
            }
        }
        // loop over property changes
        for (let prop_edit of property_edits) {
            switch (prop_edit.type) {
                case 'create':
                    // class ID should be defined in class creation loop
                    if (defined(prop_edit.class_id)) {
                        // NOTE: in the future, check and enforce that the prop name is unique
                        // register the property
                        if (prop_edit.config.type == 'relation') {
                            const prop_id = this.action_add_relation_property(prop_edit.class_id, prop_edit.prop_name, prop_edit.config.max_values);
                            // look for any relations which match the class id and prop name
                            // set their prop ID to the newly created one.
                            for (let relationship_edit of relationship_edits) {
                                if (relationship_edit.type == 'create' || relationship_edit.type == 'transfer') {
                                    for (let side of relationship_edit.sides) {
                                        if (side.class_id == prop_edit.class_id &&
                                            !defined(side.prop_id) &&
                                            side.prop_name == prop_edit.prop_name) {
                                            side.prop_id = prop_id;
                                        }
                                    }
                                }
                            }
                        }
                        else if (prop_edit.config.type == 'data') {
                            // if it's a data prop, it just has to be registered in the class table and metadata
                            this.action_add_data_property({
                                class_id: prop_edit.class_id,
                                name: prop_edit.prop_name,
                                data_type: prop_edit.config.data_type,
                                max_values: prop_edit.config.max_values
                            });
                        }
                    }
                    break;
                case 'delete':
                    const prop = (_b = (_a = this.class_cache.find(a => a.id == prop_edit.class_id)) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b.find((a) => a.id == prop_edit.prop_id);
                    if (prop && prop.type == 'relation') {
                        // queue the deletion or transfer of relations involving this prop
                        for (let junction of existing_junctions) {
                            let includes_prop = junction.sides.find(s => {
                                return s.class_id == prop_edit.class_id && s.prop_id == prop_edit.prop_id;
                            });
                            if (includes_prop) {
                                let non_matching = junction.sides.find(s => !(s.class_id == prop_edit.class_id && s.prop_id == prop_edit.prop_id));
                                if (non_matching) {
                                    if (defined(non_matching === null || non_matching === void 0 ? void 0 : non_matching.prop_id)) {
                                        // if there is a prop on the other side of the relation,
                                        // queue a transfer to a one-sided relation
                                        relationship_edits.push({
                                            type: 'transfer',
                                            id: junction.id,
                                            sides: junction.sides,
                                            new_sides: [
                                                non_matching,
                                                { class_id: prop_edit.class_id }
                                            ]
                                        });
                                    }
                                    else {
                                        // if not, no reason to keep that relation around
                                        relationship_edits.push({
                                            type: 'delete',
                                            id: junction.id
                                        });
                                    }
                                }
                            }
                        }
                    }
                    // NOTE: I might un-encapsulate the create and delete functions, given they should only be used from within this function
                    this.delete_property(prop_edit.class_id, prop_edit.prop_id);
                    break;
                case 'modify':
                    // TBD, will come back to this after relation stuff is sorted
                    // changing property metadata, not including relationship targets
                    // and making any necessary changes to cell values
                    break;
            }
        }
        // 1. first create an array to consolidate the edits
        const consolidated_relationship_edits = [];
        let valid_sides = (sides) => {
            return defined(sides[0].class_id) && defined(sides[1].class_id);
        };
        const relation_order = { transfer: 1, create: 2, delete: 3 };
        for (let relationship_edit of relationship_edits.sort((a, b) => relation_order[a.type] - relation_order[b.type])) {
            switch (relationship_edit.type) {
                // all of these are added before anything else
                case 'transfer':
                    consolidated_relationship_edits.push(relationship_edit);
                    break;
                // these are processed after the transfers but before the deletes.
                case 'create':
                    let new_sides = relationship_edit.sides;
                    if (valid_sides(new_sides)) {
                        // check if there’s an existing relation that matches both classes and one property
                        let existing = existing_junctions.find((r) => {
                            return partial_relation_match(new_sides, r.sides);
                        });
                        // if there is an existing match
                        if (existing) {
                            // look for a type:"delete" which deletes this relation
                            let delete_queued = relationship_edits.find(a => a.type == 'delete' && a.id == existing.id);
                            if (delete_queued) {
                                // if there’s a delete, push a transfer instead
                                consolidated_relationship_edits.push({
                                    type: 'transfer',
                                    id: existing.id,
                                    sides: existing.sides,
                                    new_sides: new_sides
                                });
                            }
                            // if there’s not a delete, we ignore this edit because it’s invalid
                        }
                        else {
                            // if it does not exist, add the type:"create" normally
                            consolidated_relationship_edits.push(relationship_edit);
                        }
                    }
                    break;
                // these are processed last, after the creates and transfers.
                case 'delete':
                    // check if there’s already a transfer for it in the consolidated array
                    let transfer_queued = consolidated_relationship_edits.some(a => a.type == 'transfer' && a.id == relationship_edit.id);
                    // ignore if so, add it if not.
                    if (!transfer_queued)
                        consolidated_relationship_edits.push(relationship_edit);
                    break;
            }
        }
        for (let relationship_edit of consolidated_relationship_edits) {
            switch (relationship_edit.type) {
                case 'create':
                    // create the corresponding junction table _and_ record the targets in the property definitions
                    let new_sides = relationship_edit.sides;
                    if (valid_sides(new_sides)) {
                        const junction_id = this.create_junction_table(new_sides);
                        // TBD on recording the targets
                    }
                    break;
                case 'delete':
                    this.delete_junction_table(relationship_edit.id);
                    // delete the corresponding junction table and remove target references in the property definitions
                    break;
                case 'transfer':
                    // NOTE: waiting on junction refactor to implement this
                    // creates a new junction table and deletes an old one, but transfers the old to the new
                    // ++ the steps above
                    break;
            }
        }
        this.refresh_caches(['classlist', 'items', 'junctions']);
    }
    action_delete_class(class_id) {
        // TBD
        console.log('TBD, class deletion not yet implemented');
    }
    create_junction_table(sides) {
        // NOTE: in the future I think I'm inclined to store sides as JSON, i.e. {class_id:2,prop_id:1} - slightly more verbose, but a lot more readable and less weird and arbitrary (lol why did I do it in this syntax...)
        // UPDATE: I think I used this syntax because I need a way to refer to it in junction table column names. but there must be a better way... maybe the column names can always be "side a" and "side b" with the actual props encoded in theh junction list. that seems right.
        var _a;
        // let str1=`${sides[0].class_id}.${sides[0].prop_id || ''}`;
        // let str2=`${sides[1].class_id}.${sides[1].prop_id || ''}`;
        // adds new record to junction table
        this.db.prepare(`
            INSERT INTO system_junctionlist 
            (side_0_class_id, side_0_prop_id, side_1_class_id, side_1_prop_id) 
            VALUES (@side_0_class_id,@side_0_prop_id,@side_1_class_id,@side_1_prop_id)
            `).run({
            side_0_class_id: sides[0].class_id,
            side_0_prop_id: sides[0].prop_id || null,
            side_1_class_id: sides[1].class_id,
            side_1_prop_id: sides[1].prop_id || null
        });
        //gets id of new record
        let id = (_a = this.db.prepare('SELECT id FROM system_junctionlist ORDER BY id DESC').get()) === null || _a === void 0 ? void 0 : _a.id;
        // console.log('create new junction table',this.db.prepare<[],{id:number}>('SELECT id FROM system_junctionlist ORDER BY id DESC').get())
        if (typeof id !== 'number')
            throw new Error('Something went wrong creating a new relationship');
        // creates table
        this.create_table('junction', id, [
            `"${junction_col_name(sides[0].class_id, sides[0].prop_id)}" INTEGER`,
            `"${junction_col_name(sides[1].class_id, sides[1].prop_id)}" INTEGER`
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
        // if(class_id!==undefined&&!class_data){
        //     class_data=this.retrieve_class_items({class_id});
        // }
        // if(prop_id!==undefined&&!property){
        //     // NOTE: change this in the future when properties moved to table
        //     property=class_data.metadata.properties.find(a=>a.id==prop_id);
        // }
        // if(property==undefined) throw new Error('Could not locate property')
        // let prop_name='user_'+property.name;
        // for(let item of class_data.items){
        //     let prop_values=item[prop_name];
        //     // check if they follow the conditions, and adjust if not.
        //     // for now I think just check max_values, and trim the values if not
        //     // I think (?) I can just read from the output of the cached class data,
        //     // and then use a prepare statement to modify data props on this table, and relation props on the corresponding junction table
        //     console.log(prop_name,prop_values);
        // }
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
        // NOTE: changes to make to this in the future:
        //  - for input readability, allow class_name and prop_name as input options, assuming they’re enforced as unique, and use them to look up IDs
        //  - enforce max_values here
        var _a;
        let column_names = {
            input_1: junction_col_name(input_1.class_id, input_1.prop_id),
            input_2: junction_col_name(input_2.class_id, input_2.prop_id)
        };
        let junction_id = (_a = this.junction_cache.find(j => full_relation_match(j.sides, [input_1, input_2]))) === null || _a === void 0 ? void 0 : _a.id;
        console.log('this.junction_cache', this.junction_cache[0], 'input_1', input_1, 'input_2', input_2);
        if (junction_id) {
            this.db.prepare(`
                INSERT INTO junction_${junction_id} 
                ("${column_names.input_1}", "${column_names.input_2}") 
                VALUES (${input_1.item_id},${input_2.item_id})
            `).run();
        }
        else {
            throw Error('Something went wrong - junction table for relationship not found');
        }
    }
    retrieve_class_items({ class_id, class_name, class_data }) {
        if (class_name == undefined || class_data == undefined) {
            class_data = this.class_cache.find(a => a.id == class_id);
            if (class_data == undefined)
                throw new Error('Cannot find class in class list.');
            class_name = class_data.name;
        }
        ;
        const class_string = `[class_${class_name}]`;
        // //joined+added at beginning of the query, built from relations
        const cte_strings = [];
        // //joined+added near the end of the query, built from relations
        const cte_joins = [];
        // //joined+added between SELECT and FROM, built from relations
        const relation_selections = [];
        let relation_properties = class_data.properties.filter(a => a.type == 'relation');
        // console.log('class_meta.properties',class_meta.properties,'relation_properties',relation_properties)
        for (let prop of relation_properties) {
            const target_selects = [];
            let property_junction_column_name = junction_col_name(class_id, prop.id);
            if (prop.relation_targets.length > 0) {
                for (let i = 0; i < prop.relation_targets.length; i++) {
                    // find the side that does not match both the class and prop IDs
                    let target = prop.relation_targets[i];
                    if (target) {
                        let target_junction_column_name = junction_col_name(target.class_id, target.prop_id);
                        let junction_id = target.junction_id;
                        let target_select = `SELECT "${property_junction_column_name}", json_object('class_id',${target.class_id},'id',"${target_junction_column_name}") AS target_data FROM junction_${junction_id}`;
                        target_selects.push(target_select);
                    }
                    else {
                        throw Error('Something went wrong trying to retrieve relationship data');
                    }
                }
                // uses built-in aggregate json function instead of group_concat craziness
                const cte = `[${prop.id}_cte] AS (
                    SELECT "${property_junction_column_name}", json_group_array( json(target_data) ) AS [user_${prop.name}]
                    FROM 
                    (
                        ${target_selects.join(` 
                        UNION 
                        `)}
                    )
                    GROUP BY "${property_junction_column_name}"
                )`;
                cte_strings.push(cte);
                relation_selections.push(`[${prop.id}_cte].[user_${prop.name}]`);
                cte_joins.push(`LEFT JOIN [${prop.id}_cte] ON [${prop.id}_cte]."${property_junction_column_name}" = ${class_string}.system_id`);
            }
            else {
                relation_selections.push(`'[]' AS [user_${prop.name}]`);
            }
        }
        let orderby = `ORDER BY ${class_string}.system_order`;
        let comma_break = `,
            `;
        let query = `
            ${cte_strings.length > 0 ? "WITH " + cte_strings.join(comma_break) : ''}
            SELECT [class_${class_name}].* ${relation_selections.length > 0 ? ', ' + relation_selections.join(`, `) : ''}
            FROM [class_${class_name}]
            ${cte_joins.join(' ')}
            ${orderby}`;
        console.log('query', query);
        // possibly elaborate this any type a little more in the future, e.g. a CellValue or SQLCellValue type that expects some wildcards
        let items = this.db.prepare(query).all();
        let stringified_properties = class_data.properties.filter(a => a.type == 'relation' || can_have_multiple_values(a.max_values));
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
        return items;
    }
    retrieve_all_classes() {
        const classes_data = this.run.get_all_classes.all();
        return classes_data.map(({ id, name, metadata }) => {
            var _a;
            let existing_items = this.item_cache.find((itemlist) => itemlist.class_id == id);
            let properties_sql = this.db.prepare(`SELECT * FROM class_${id}_properties`).all() || [];
            let properties = properties_sql.map((sql_prop) => this.parse_sql_prop(id, sql_prop));
            return {
                id,
                name,
                items: (_a = existing_items === null || existing_items === void 0 ? void 0 : existing_items.items) !== null && _a !== void 0 ? _a : [],
                properties,
                metadata: JSON.parse(metadata)
            };
        });
    }
    parse_sql_prop(class_id, sql_prop) {
        if (sql_prop.type == 'data' && defined(sql_prop.data_type)) {
            return {
                type: 'data',
                id: sql_prop.id,
                name: sql_prop.name,
                max_values: sql_prop.max_values,
                data_type: sql_prop.data_type
            };
        }
        else if (sql_prop.type == 'relation') {
            let associated_junctions = this.run.get_junctions_matching_property.all({ class_id: class_id, prop_id: sql_prop.id }) || [];
            let relation_targets = associated_junctions.map((j) => {
                let sides = JSON.parse(j.sides);
                // find the side that does not match both the class and prop IDs
                let target = sides.find(a => !(a.class_id == class_id && a.prop_id == sql_prop.id));
                if (!target)
                    throw Error('Something went wrong locating target of relationship');
                return Object.assign(Object.assign({}, target), { junction_id: j.id });
            });
            return {
                type: 'relation',
                id: sql_prop.id,
                name: sql_prop.name,
                max_values: sql_prop.max_values,
                relation_targets
            };
        }
        else {
            throw Error('property type does not match known types');
        }
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
// // match both classes
//  // match at least one prop
//  let a0_match_i=b.findIndex(side=>a[0].class_id==side.class_id);
//  let a1_match_i=b.findIndex(side=>a[1].class_id==side.class_id);
//  if(a0_match_i>=0&&a1_match_i>=0&&a0_match_i!==a1_match_i){
//      return b[a0_match_i].prop_id==a[0].prop_id||
//             b[a1_match_i].prop_id==a[1].prop_id
//  }else{
//      return false;
//  }
//# sourceMappingURL=index.js.map