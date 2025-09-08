import Database from 'better-sqlite3';
import {defined,partial_relation_match,full_relation_match,can_have_multiple_values,junction_col_name, side_match,two_way,edit_has_valid_sides,readable_edit} from './utils.js';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import type {
    SQLTableType,
    SQLClassListRow,
    SQLJunctonListRow,
    JunctionSides,
    RelationshipSideBase,
    JunctionList,
    ClassList,
    ClassMetadata,
    Property,
    DataType,
    ItemRelationSide,
    SQLApplicationWindow,
    ApplicationWindow,
    SQLWorkspaceBlockRow,
    WorkspaceBlock,
    ClassData,
    ClassRow,
    ClassEdit,
    RelationEdit,
    PropertyEdit,
    MaxValues,
    PropertyType,
    RelationProperty,
    DataProperty,
    RelationEditValidSides,
    ItemPagination,
    PaginatedItems
} from './types.js';

const text_data_types=['string','resource'];

const integer_data_types=['boolean'];

const real_data_types=['number'];

export default class Project{
    db:DatabaseType;

    run:{
        [key:string]:Statement;
        get_all_classes:Statement<[],SQLClassListRow>;
        get_junctionlist:Statement<[],SQLJunctonListRow>;
        get_junctions_matching_property:Statement<{class_id:number,prop_id:number | null},{id:number,sides:string}>;
        get_windows:Statement<[],SQLApplicationWindow>;
        get_class_id:Statement<[string],{id:number}>;
    };

    class_cache:ClassList=[];
    junction_cache:JunctionList=[];

    constructor(source:string){
        this.db= new Database(source);
    
        
        //checks if goby has been initialized, initializes if not
        const goby_init=this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='system_root'`).get();
        if(!goby_init){
          console.log('initializing goby database');
          this.init();
        }else{
          console.log('opened goby database');
        }
       
        //prepared statements with arguments so my code isn't as verbose elsewhere
        this.run={
            begin:this.db.prepare('BEGIN IMMEDIATE'),
            commit:this.db.prepare('COMMIT'),
            rollback:this.db.prepare('ROLLBACK'),
            create_item:this.db.prepare('INSERT INTO system_root(type,value) VALUES (@type, @value)'),
            get_junctionlist:this.db.prepare<[],SQLJunctonListRow>(`
                SELECT 
                id, 
                json_array( 
                    json_object('class_id',side_0_class_id,'prop_id',side_0_prop_id), 
                    json_object('class_id',side_1_class_id,'prop_id',side_1_prop_id)
                ) AS sides, 
                metadata FROM system_junctionlist`),
            get_junctions_matching_property:this.db.prepare<{class_id:number,prop_id:number | null},{id:number,sides:string}>(`
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
            get_class:this.db.prepare(`SELECT name, metadata FROM system_classlist WHERE id = ?`),
            get_class_id:this.db.prepare<[string],{id:number}>(`SELECT id FROM system_classlist WHERE name = ?`),
            get_all_classes:this.db.prepare<[],SQLClassListRow>(`SELECT id, name, metadata FROM system_classlist`),
            save_class_meta:this.db.prepare(`UPDATE system_classlist set metadata = ? WHERE id = ?`),
            update_window:this.db.prepare(`UPDATE system_windows set open = @open, type=@type, metadata = @meta WHERE id = @id`),
            create_window: this.db.prepare(`INSERT INTO system_windows (type,open, metadata) VALUES (@type, @open, @meta)`),
            get_windows:this.db.prepare<[],SQLApplicationWindow>(`SELECT id, type, open, metadata FROM system_windows`)
        }

        



        this.refresh_caches(['classlist','junctions']);

        
        // commenting this out until I figure out my transaction / one-step-undo functionality
        //if I understand transactions correctly, a new one will begin with every user action while committing the one before, meaning I'll need to have the first begin here
        // this.run.begin.run();
        
    }

    get_latest_table_row_id(table_name:string):number | null{
        let db_get=this.db.prepare<[],{id:number}>(`SELECT last_insert_rowid() AS id FROM ${table_name}`).get();
        // if no row found, silently return null
        if(!db_get) return null;
        let id=db_get.id;
        return id;
    }

    init(){
        //System table to contain all items in the project.
        this.create_table('system','root',[
            'id INTEGER NOT NULL PRIMARY KEY',
            'type TEXT',
            'value TEXT'
        ]);
    
        //System table to contain metadata for all classes created by user
        this.create_table('system','classlist',['id INTEGER NOT NULL PRIMARY KEY','name TEXT','metadata TEXT']);
        //System table to contain all the junction tables and aggregate info about relations
        this.create_table('system','junctionlist',[
            'id INTEGER NOT NULL PRIMARY KEY',
            'side_0_class_id INTEGER NOT NULL',
            'side_0_prop_id INTEGER',
            'side_1_class_id INTEGER NOT NULL',
            'side_1_prop_id INTEGER',
            'metadata TEXT'
        ]);
        //System table to contain generated image data
        this.create_table('system','images',['file_path TEXT','img_type TEXT','img BLOB']);
        
        // window "open" is a boolean stored as 0 or 1
        this.create_table('system','windows',[
            'id INTEGER NOT NULL PRIMARY KEY',
            'type TEXT',
            'open INTEGER',
            'metadata TEXT'
        ]);
        

        this.db.prepare(`INSERT INTO system_windows 
            (type, open, metadata) 
            VALUES 
            ('home',0,'${JSON.stringify({pos:[null,null], size:[540,400]})}'),
            ('hopper',0,'${JSON.stringify({pos:[null,null], size:[300,400]})}')`).run();

        // [TO ADD: special junction table for root items to reference themselves in individual relation]
        this.create_table('system','junction_root',[
            'id_1 INTEGER',
            'id_2 INTEGER',
            'metadata TEXT'
        ]);
        

        
   
        
    }


    refresh_caches(caches:('classlist' | 'items' | 'junctions')[]){
        if(caches.includes('classlist')){
            this.class_cache=this.retrieve_all_classes();
        }
        
        if(caches.includes('junctions')){
            this.junction_cache=this.get_junctions();
        }
    }
     

    create_table(type:SQLTableType,name:string | number,columns:string[]){
        //type will pass in 'class', 'system', or 'junction' to use as a name prefix
        //columns is an array of raw SQL column strings
        
        let columns_string=columns.join(',');

        //brackets to allow special characters in user-defined names
        // validation test: what happens if there are brackets in the name?
        const sqlname=type=='class'?`[class_${name}]`:type=='properties'?`class_${name}_properties`:`${type}_${name}`;
        let create_statement=`CREATE TABLE ${sqlname}(
          ${columns_string}
        )`;
        this.db.prepare(create_statement).run();
    }

    action_create_class(name:string ):number{

        //a class starts with these basic columns
        let columns=[
            'system_id INTEGER UNIQUE',
            'system_order REAL',
            'user_Name TEXT',
            `FOREIGN KEY(system_id) REFERENCES system_root(id)`
        ]; 

        this.create_table('class',name,columns);

        const class_meta:ClassMetadata={
            style:{
                color: '#b5ffd5'
            },
            label:{
                // TODO: build functionality to change label property in the future
                properties:[1]
            }
        };

        // create entry for class in classlist
        this.db.prepare(`INSERT INTO system_classlist (name, metadata) VALUES ('${name}','${JSON.stringify(class_meta)}')`).run();
        
        //get the id of the newest value
        const class_id=this.db.prepare<[],{id:number}>('SELECT id FROM system_classlist ORDER BY id DESC').get()?.id;
        if(class_id==undefined) throw new Error('Something went wrong when generating new class.');

        // create a table to record properties of this class
        this.create_table('properties',class_id,[
            `id INTEGER NOT NULL PRIMARY KEY`,
            `system_order REAL`,
            `name TEXT NOT NULL`,
            `type`,
            `data_type TEXT`,
            `max_values INTEGER`,
            `metadata TEXT`
        ])

        this.refresh_caches(['classlist']);

        // add an entry in the property table for the default "name" property. 
        this.add_data_property({class_id,name:'Name',data_type:'string',max_values:1,create_column:false})


        return class_id;
        
    }


    add_data_property({
        class_id,
        name,
        data_type,
        max_values,
        create_column=true
    }:{
        class_id:number,
        name:string,
        data_type:DataType,
        max_values:MaxValues,
        create_column?:boolean
    }){
        // 1. Add property to property table  ---------------------------------------------------

        let property_table=`class_${class_id}_properties`;
        const system_order=this.get_next_order(property_table);

        this.db.prepare(`INSERT INTO ${property_table} (name,type,data_type,max_values,metadata,system_order) VALUES (@name,@type,@data_type,@max_values,@metadata,@system_order)`).run({
            name,
            type:'data',
            data_type,
            max_values,
            metadata:'{}',
            system_order
        })
        // let prop_id=this.get_latest_table_row_id(property_table);

        // 2. Add column to class table ------------------------------------------------
        if(create_column){
            const class_data=this.lookup_class(class_id);
            let class_name=class_data.name;

            let sql_data_type='';

            if(can_have_multiple_values(max_values)||text_data_types.includes(data_type)){
                //multiple for data means a stringified array no matter what it is
                sql_data_type='TEXT';
            }else if(real_data_types.includes(data_type)){
                sql_data_type='REAL';
            }else if (integer_data_types.includes(data_type)){
                sql_data_type='INTEGER';
            }
            
            //create property in table
            let command_string=`ALTER TABLE [class_${class_name}] ADD COLUMN [user_${name}] ${sql_data_type};`;
            this.db.prepare(command_string).run();           
        }
        this.refresh_caches(['classlist']);
        
    }

    add_relation_property(class_id:number,name:string,max_values:MaxValues){

        let property_table=`class_${class_id}_properties`;

        const system_order=this.get_next_order(property_table);

        this.db.prepare(`INSERT INTO ${property_table} (name,type,max_values,metadata,system_order) VALUES (@name,@type,@max_values,@metadata,@system_order)`).run({
            name,
            type:'relation',
            max_values,
            metadata:'{}',
            system_order
        })

        let prop_id=this.get_latest_table_row_id(property_table);
        
        if(defined(prop_id)){
            this.refresh_caches(['classlist']);
            return prop_id;
        }else{
            throw Error('Something went wrong registering a property for the class')
        }

        // WONDERING WHERE THE RELATIONSHIP TARGET LOGIC IS?
        // this info is not stored directly on the property, but as a relationship/junction record
        // this is processed in action_edit_class_schema, which handles relation changes/additions concurrently for all the classes they affect.

    }


    delete_property(class_id:number,prop_id:number){
        // NOTE: I need to enforce that you can’t delete the default "name" property

        // this function is meant to be used within a flow where the relations that need to change as a result of this deletion are already kept track of

        let class_data=this.class_cache.find(a=>a.id==class_id);
        if(!class_data) throw new Error('Cannot locate class to delete property from.');
        let property=class_data.properties.find(a=>a.id==prop_id);
        if(!property) throw new Error('Cannot locate property to delete.');
        
        // delete it from property record
        this.db.prepare(`DELETE FROM class_${class_id}_properties WHERE id = ${prop_id}`).run();

        if(property.type=='data'){
            // drop column from class table if of type data
            this.db.prepare(`ALTER TABLE class_${class_id} DROP COLUMN [user_${property.name}]`);
        }
        
        this.refresh_caches(['classlist']);
        
    }


    get_junctions(){
        let junction_list_sql=this.run.get_junctionlist.all();
        let junction_list_parsed=junction_list_sql.map(a=>{
            let sides=JSON.parse(a.sides) as JunctionSides;
            return {
                ...a,
                sides
            }
        });
        return junction_list_parsed;
    }

    action_edit_class_schema({
        class_edits =[],
        property_edits = [],
        relationship_edits = []
    }:{
        class_edits?:ClassEdit[],
        property_edits?:PropertyEdit[],
        relationship_edits?:RelationEdit[]
    }){

        // get the list of existing relationships

        // loop over class changes and make/queue them as needed
        for(let class_edit of class_edits){
            switch(class_edit.type){
                case 'create':
                    // NOTE: in the future, check and enforce that the class name is unique

                    // register the class and get the ID
                    let class_id=this.action_create_class(class_edit.class_name);
                    // find all the properties which reference this new class name, and set the class_id.
                    for(let prop_edit of property_edits){
                        // only a newly created prop would be missing a class id
                        if(prop_edit.type=='create'){
                            if(
                                (!defined(prop_edit.class_id)) && 
                                prop_edit.class_name== class_edit.class_name
                            ){
                                prop_edit.class_id=class_id;
                            }
                        }
                    }
                    // do the same for relations
                    for(let relationship_edit of relationship_edits){
                        if(relationship_edit.type=='create' || relationship_edit.type=='transfer'){
                            for(let side of relationship_edit.sides){
                                if(!side.class_id && side.class_name == class_edit.class_name){
                                    side.class_id=class_id;
                                }
                            }
                        }
                        
                    }
                break;
                case 'delete':
                    if(class_edit.class_id){
                        this.action_delete_class(class_edit.class_id);
                        // look for any relationships which will be affected by the deletion of this class, and queue deletion
                        for(let junction of this.junction_cache){
                            if(junction.sides.some(s=>s.class_id==class_edit.class_id)){
                                relationship_edits.push({
                                    type:'delete',
                                    id:junction.id
                                })
                            }
                        }
                    }else{
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
        for(let prop_edit of property_edits){
            
            switch(prop_edit.type){
                case 'create':
                    // class ID should be defined in class creation loop
                    if(defined(prop_edit.class_id)){

                        // NOTE: in the future, check and enforce that the prop name is unique

                        // register the property
                        if(prop_edit.config.type == 'relation'){
                            const prop_id=this.add_relation_property(
                                prop_edit.class_id,
                                prop_edit.prop_name,
                                prop_edit.config.max_values
                            );

                            // look for any relations which match the class id and prop name
                            // set their prop ID to the newly created one.
                            for(let relationship_edit of relationship_edits){
                                if(relationship_edit.type=='create' || relationship_edit.type=='transfer'){
                                    for(let side of relationship_edit.sides){
                                        if(
                                            side.class_id==prop_edit.class_id && 
                                            !defined(side.prop_id) && 
                                            side.prop_name==prop_edit.prop_name 
                                        ){
                                            side.prop_id=prop_id;
                                        }
                                    }
                                }
                                
                            }
                        }else if(prop_edit.config.type == 'data'){
                            // if it's a data prop, it just has to be registered in the class table and metadata
                            this.add_data_property({
                                class_id:prop_edit.class_id,
                                name:prop_edit.prop_name,
                                data_type:prop_edit.config.data_type,
                                max_values:prop_edit.config.max_values
                            });
                        }
                    }
                    
                    break;
                case 'delete':
                    const prop=this.class_cache.find(a=>a.id==prop_edit.class_id)?.properties?.find((a)=>a.id==prop_edit.prop_id);
                    if(prop&&prop.type=='relation'){
                        // queue the deletion or transfer of relations involving this prop
                        
                        for(let junction of this.junction_cache){
                            let includes_prop=junction.sides.find(s=>{
                                return s.class_id==prop_edit.class_id&&s.prop_id==prop_edit.prop_id;
                            })
                            if(includes_prop){
                                let non_matching=junction.sides.find(s=>!(s.class_id==prop_edit.class_id&&s.prop_id==prop_edit.prop_id));

                                if(non_matching){
                                   
                                    if(defined(non_matching?.prop_id)){
                                        // if there is a prop on the other side of the relation,
                                        // and (to add) if there is not a partial match create or transfer in relationship_edits
                                        // queue a transfer to a one-sided relation

                                        // NOTE: I need to see if this can create any kind of conflict with existing relationship edits
                                        relationship_edits.push({
                                            type:'transfer',
                                            id:junction.id,
                                            sides:junction.sides,
                                            new_sides:[
                                                non_matching,
                                                {class_id:prop_edit.class_id}
                                            ]
                                        })
                                    }else{
                                        // if not, no reason to keep that relation around
                                        relationship_edits.push({
                                            type:'delete',
                                            id:junction.id
                                        })
                                    }
                                }
                                

                            }
                        }
                    }

                    // NOTE: I might un-encapsulate the create and delete functions, given they should only be used from within this function
                    this.delete_property(prop_edit.class_id,prop_edit.prop_id);
                    
                    
                    break;
                case 'modify':
                    // TBD, will come back to this after relation stuff is sorted
                    // changing property metadata, not including relationship targets
                    // and making any necessary changes to cell values
                    break;
            }
            
            
        }
        
        this.refresh_caches(['classlist']);

        // find cases where relationships getting deleted can transfer their connections to relationships getting created
        let consolidated_relationship_edits:RelationEditValidSides[]=this.consolidate_relationship_edits(relationship_edits);
        
        for(let relationship_edit of consolidated_relationship_edits){
            switch(relationship_edit.type){
                case 'create':{
                        // create the corresponding junction table
                        let new_sides=relationship_edit.sides;
                        this.create_junction_table(new_sides);
                    }
                    break;
                case 'delete':
                    // delete the corresponding junction table
                    this.delete_junction_table(relationship_edit.id);
                    break;
                case 'transfer':{
                        let old_sides=relationship_edit.sides;
                        let new_sides=relationship_edit.new_sides;
                        // 1. create the new junction table 
                        const junction_id=this.create_junction_table(new_sides);

                        // 2. copy over the rows from the old table
                        this.transfer_connections({
                            id:relationship_edit.id,
                            sides:old_sides
                        },{
                            id:junction_id,
                            sides:new_sides
                        })
                    }
                    break;
            }
        }

        this.refresh_caches(['classlist','items','junctions']);

    }


    consolidate_relationship_edits(relationship_edits:RelationEdit[]):RelationEditValidSides[]{
        let class_cache=this.class_cache;
        
        let consolidated_relationship_edits:(RelationEditValidSides&{exclude?:boolean})[]=[];
        const relation_order={transfer:1,create:2,delete:3};
        const sort_edits=(a:RelationEdit,b:RelationEdit)=>relation_order[a.type] - relation_order[b.type];

        let source_array:RelationEditValidSides[]=[...relationship_edits.filter(edit_has_valid_sides)];
        source_array.sort(sort_edits);
        for(let i=0;i<source_array.length;i++){
            let relationship_edit=source_array[i];
            switch(relationship_edit.type){
                // all of these are added before anything else
                case 'transfer':{
                    console.log(`Queing ${readable_edit(relationship_edit,class_cache)}`);

                    push_if_valid(relationship_edit);
                    // transferring the connections implies deleting the source, so we queue that deletion
                    // deletions only happen after all the transfers, 
                    // so that multiple properties can copy from the same source.
                    let delete_queued=source_array.find(a=>a.type=='delete' && a.id==relationship_edit.id);
                    if(!delete_queued){
                        let del:RelationEditValidSides={
                            type:'delete',
                            id:relationship_edit.id
                        };
                        console.log(`Queuing ${readable_edit(del,class_cache)} after transfer`)
                        source_array.push(del)
                    }
                }
                    
                break;

                // these are processed after the transfers but before the deletes.
                case 'create':{
                    let new_sides=relationship_edit.sides;
                    // check if there’s an existing relation that matches both classes and one property
                    let existing = this.junction_cache.find((r)=>{
                        return partial_relation_match(new_sides,r.sides);
                    })
                    
                    // if there is an existing match
                    if(existing){
                        // look for a type:"delete" which deletes this relation
                        let delete_queued=source_array.find(a=>a.type=='delete' && a.id==existing.id);

                        if(delete_queued){
                            let new_transfer:RelationEditValidSides={
                                type:'transfer',
                                id:existing.id,
                                sides:existing.sides,
                                new_sides:new_sides
                            }

                            console.log(`Found valid ${readable_edit(new_transfer,class_cache)}`)
                            // if there’s a delete, push a transfer instead
                            push_if_valid(new_transfer)
                        }else{
                            console.log(`Ignoring ${readable_edit(relationship_edit,class_cache)}; Cannot create a second relationship between two classes involving the same property.`)
                        }
                        // if there’s not a delete, we ignore this edit because it’s invalid
                    }else{
                        // if it does not exist, add the type:"create" normally
                        push_if_valid(relationship_edit);
                    }
                }
                break;
                
                // these are processed last, after the creates and transfers.
                case 'delete':
                    // these are always processed at the very end
                    push_if_valid(relationship_edit);
                    break;
            }
        }

        // lastly, filter out duplicates of the same partial match (has to be separate because it picks the most specific);
        consolidated_relationship_edits=filter_best_of_partial_matches(consolidated_relationship_edits);

        return consolidated_relationship_edits;

        // ignores if it already exists in the consolidated list (deduplication)
        // ignores if it targets a class/property that no longer exists
        function push_if_valid(edit:RelationEditValidSides){
            let edit_already_added;
            let targets_exist=true;
            switch(edit.type){
                case 'create':{
                    edit_already_added=consolidated_relationship_edits.some(a=>{
                        return a.type=='create' 
                               && full_relation_match(a.sides,edit.sides)
                    })

                    targets_exist=check_if_targets_exist(edit.sides);
                }
                break;
                case 'delete':{
                    edit_already_added=consolidated_relationship_edits.some(a=>a.type=='delete'&&a.id==edit.id);
                }
                break;
                case 'transfer':{
                    edit_already_added=consolidated_relationship_edits.some(a=>{
                        return a.type=='transfer' 
                               && a.id==edit.id
                               && full_relation_match(a.new_sides,edit.new_sides);
                    })
                    targets_exist=check_if_targets_exist(edit.sides);
                }
            }

            if(!(targets_exist && !edit_already_added)) console.log('Skipped invalid',edit,'\n   targeting deleted class/property:',!targets_exist,'\n   edit already added:',edit_already_added);
            if(targets_exist && !edit_already_added) consolidated_relationship_edits.push(edit);
        }

        function check_if_targets_exist(sides:[RelationshipSideBase,RelationshipSideBase]){
            for(let side of sides){
                let class_for_side=class_cache.find((c)=>c.id==side.class_id);
                if(!class_for_side){
                    return false;
                }else if(defined(side.prop_id)){
                    let prop=class_for_side.properties.find(a=>a.id==side.prop_id);
                    if(!prop) return false;
                }
            }

            return true;
        }

        // allow no more than one of each partial match (partial match = shares both classes and one property)
        // privilege relations with properties on both sides (two way); else accept the first one in the list.
        function filter_best_of_partial_matches(edits:(RelationEditValidSides & {exclude?:boolean})[]){
            return edits.filter(edit=>{
                
                if(edit.type=='delete') return true;
                if(edit.exclude) return false;
                
                // keeps track of whether or not to keep this item in filtered selection
                let include=true;
                
                let sides=edit.type=='transfer'?edit.new_sides:edit.sides;
                let is_two_way=two_way(sides);
                
                // look for partial matches in the array
                for(let comparison of consolidated_relationship_edits){
                    if(comparison==edit || comparison.type == 'delete' || comparison.exclude){
                        // ignore if not applicable
                        continue;
                    }else{
                        let comparison_sides=comparison.type=='transfer'?comparison.new_sides:comparison.sides;
                        // check if it’s a partial match
                        if(partial_relation_match(comparison_sides,sides)){
                            // if so, check if the compared edit is two-way
                            let comparison_is_two_way = two_way(comparison_sides);
                            
                            if(!is_two_way && comparison_is_two_way){
                                // if the comparison is two-way and this item is not, we know it should not be included
                                // because there is something higher priority
                                console.log(`Excluding ${readable_edit(edit,class_cache)} as there is a higher priority relation`)
                                edit.exclude=true;
                                include = false;
                            }else{
                                console.log(`Excluding ${readable_edit(comparison,class_cache)} as there is a higher priority relation`)
                                // we know the current item is higher priority, and so we ought to exclude the compared item for the rest of the loop
                                comparison.exclude=true;
                            }
                        }
                    }
                }
    
                return include;
    
            })
        }
    }


    action_delete_class(class_id:number){
        // TBD
        console.log('TBD, class deletion not yet implemented')
    }


    

    
    create_junction_table(sides:JunctionSides){

        // adds new record to junction table
        this.db.prepare(`
            INSERT INTO system_junctionlist 
            (side_0_class_id, side_0_prop_id, side_1_class_id, side_1_prop_id) 
            VALUES (@side_0_class_id,@side_0_prop_id,@side_1_class_id,@side_1_prop_id)
            `).run({
                side_0_class_id:sides[0].class_id,
                side_0_prop_id:sides[0].prop_id || null,
                side_1_class_id:sides[1].class_id,
                side_1_prop_id:sides[1].prop_id || null
            });

        //gets id of new record
        let id=this.db.prepare<[],{id:number}>('SELECT id FROM system_junctionlist ORDER BY id DESC').get()?.id;
        if(typeof id !== 'number') throw new Error('Something went wrong creating a new relationship');

        // creates table
        this.create_table('junction',id,[
            `"${junction_col_name(sides[0].class_id,sides[0].prop_id)}" INTEGER`,
            `"${junction_col_name(sides[1].class_id,sides[1].prop_id)}" INTEGER`,
            `date_added INTEGER`
        ]);

        return id;
    }


    transfer_connections(source:{sides:JunctionSides,id:number},target:{sides:JunctionSides,id:number}){
        
        let source_match_index=side_match(target.sides[0],source.sides[0])?0:1;
        
        // flip the order if needed to maximally match the sides
        let source_ordered=[
            source.sides[source_match_index],
            source.sides[Math.abs(source_match_index-1)]
        ]

        let source_col_names=[
            junction_col_name(source_ordered[0].class_id,source_ordered[0].prop_id),
            junction_col_name(source_ordered[1].class_id,source_ordered[1].prop_id)
        ]

        let target_col_names=[
            junction_col_name(target.sides[0].class_id,target.sides[0].prop_id),
            junction_col_name(target.sides[1].class_id,target.sides[1].prop_id)
        ]

        this.db.prepare(`
            INSERT INTO junction_${target.id} (${target_col_names[0]},${target_col_names[1]}) 
            SELECT ${source_col_names[0]}, ${source_col_names[1]} FROM junction_${source.id}`
         ).run();
    }

    delete_junction_table(id:number){
        this.db.prepare(`DELETE FROM system_junctionlist WHERE id = ${id}`).run();
        this.db.prepare(`DROP TABLE junction_${id}`).run();
    }

    check_conditions({class_id,prop_id,property,class_data}:{class_id?:number,prop_id?:number,property?:Property,class_data:ClassData}){
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

    action_save(){
        if(this.db.inTransaction) this.run.commit.run();
        this.db.close();
    }

    create_item_in_root({type=null,value=''}:{type:string|null,value?:string}){
        // this.db.prepare('INSERT INTO system_root VALUES (null)').run();
        this.run.create_item.run({type,value});
        let id=this.db.prepare<[],{id:number}>('SELECT id FROM system_root ORDER BY id DESC').get()?.id;
        if(typeof id !== 'number') throw new Error('Something went wrong creating a new item');
        return id;
    }

    delete_item_from_root(id:number){
        this.db.prepare(`DELETE FROM system_root WHERE id = ${id}`).run();
    }
    
    action_set_root_item_value(id:number,value:string){
        this.db.prepare(`UPDATE system_root set value = ? WHERE id = ?`).run(value,id);
    }

    lookup_class(class_id:number):ClassData{
        const class_data=this.class_cache.find(a=>a.id==class_id);
        if(class_data == undefined) throw new Error('Cannot find class in class list.');
        return class_data;
    }

    action_add_row(class_id:number){
        const class_data=this.lookup_class(class_id);
        let class_name=class_data.name;

        //first add new row to root and get id
        const root_id=this.create_item_in_root({type:'class_'+class_id});
        
        
        //get the last item in class table order and use it to get the order for the new item
        const new_order=this.get_next_order(`[class_${class_name}]`);
   
        this.db.prepare(`INSERT INTO [class_${class_name}] (system_id, system_order) VALUES (${root_id},${new_order})`).run();

        return root_id;
    }

    get_next_order(table_name:string){
        const last_ordered_item=this.db.prepare<[],{system_order:number}>(`SELECT system_order FROM ${table_name} ORDER BY system_order DESC`).get();
        const new_order=last_ordered_item?last_ordered_item.system_order+1000:0;
        return new_order;
    }

    // NOTE: seems like there should be a way to pair down "value:any" in params, maybe at least make it one of a few value types
    action_set_property_values(class_id:number,item_id:number,changes:{property_id:number,value:any}[]){
        const class_data=this.lookup_class(class_id);
        const sql_column_inserts=[];

        for(let change of changes){
            const prop_data=class_data.properties.find((p)=>p.id==change.property_id);
            if(prop_data&&prop_data.type=='data'){
                // const data_type=prop_data.data_type;
                const cell_value=validate(change.value,prop_data.data_type,prop_data.max_values);
                if(cell_value.valid){
                    sql_column_inserts.push({
                        column_name:`[user_${prop_data.name}]`,
                        cell_value:cell_value.output
                    })
                }else{
                    console.log(`Did not modify ${prop_data.name} for item ${item_id}: ${cell_value.message}`);
                }

            }else if(prop_data&&prop_data.type=='relation'){
                console.log('haven’t added handling for relation props here yet')
            }
        }


        const params=sql_column_inserts.map((a)=>a.cell_value);
        const set_statements=sql_column_inserts.map((p)=>`${p.column_name} = ?`).join(',');
        
        const insert_statement=`UPDATE [class_${class_data.name}] SET ${set_statements} WHERE system_id=${item_id}`;


        this.db.prepare(insert_statement).run(params);

        function validate(input:any,data_type:DataType,max_values:MaxValues):{valid:true,output:string | number} | {valid:false,message:string}{
            const multiple=max_values==null||max_values>1;
            const values=multiple?input:[input];
            if(!Array.isArray(values)){
                return {valid:false,message:'Expecting array, got single value'};
            }
            
            const validated_values=[];

            for(let value of values){
                if(real_data_types.includes(data_type) || integer_data_types.includes(data_type)){
                    if(data_type=='boolean'){
                        if(typeof value=='boolean' || [0,1].includes(value)){
                            validated_values.push(+value);
                        }else{
                            return {valid:false,message:`Expecting boolean or binary integer, got "${value}" (${typeof value})`};
                        }
                    }else if(typeof value=='number'){
                        validated_values.push(value);
                    }else{
                        return {valid:false,message:`Expecting number, got "${value}" (${typeof value})`};
                    }
                }else if(text_data_types.includes(data_type)){
                    // NOTE: could come back to validate resource as links/filepaths later, but leaving unopinionated for now
                    if(typeof value=='string'){
                        validated_values.push(value);
                    }else{
                        return {valid:false,message:`Expecting string, got "${value}" (${typeof value})`};
                    }
                }
            }

            const output=multiple?JSON.stringify(validated_values):validated_values[0];

            return {
                valid:true,
                output
            }
        }
        
    }

    

    action_edit_relations(
        relations:{
            change:'add'|'remove',
            sides:[input_1:ItemRelationSide,input_2:ItemRelationSide]
        }[]
    ){
        // NOTE: changes to make to this in the future:
        //  - for input readability, allow class_name and prop_name as input options, assuming they’re enforced as unique, and use them to look up IDs
        //  - enforce max_values here

        for(let {change,sides} of relations){
            const [input_1,input_2] = sides;

            const column_names={
                input_1:junction_col_name(input_1.class_id,input_1.prop_id),
                input_2:junction_col_name(input_2.class_id,input_2.prop_id)
            }

            const junction_id=this.junction_cache.find(j=>full_relation_match(j.sides,[input_1,input_2]))?.id;

            if(junction_id){
                if(change=='add'){
                    const date_added=Date.now();
                    this.db.prepare(`
                        INSERT INTO junction_${junction_id} 
                        ("${column_names.input_1}", "${column_names.input_2}",date_added) 
                        VALUES (${input_1.item_id},${input_2.item_id},${date_added})
                    `).run();
                }else if (change=='remove'){
                    this.db.prepare(`
                        DELETE FROM junction_${junction_id} 
                        WHERE "${column_names.input_1}" = ${input_1.item_id}
                        AND "${column_names.input_2}" = ${input_2.item_id}`
                    ).run();
                }
            }else{
                throw Error('Something went wrong - junction table for relationship not found')
            }
            
    
        }

        
        // NOTE: should this trigger a refresh to items?
    }


    // MARKER: modify item retrieval
    retrieve_class_items({class_id,class_name,class_data,pagination={}}:{class_id:number,class_name?:string,class_data?:ClassData,pagination?:ItemPagination}):PaginatedItems{
        const pagination_defaults:ItemPagination={
            page_size:null,
            property_range:'all',
            item_range:'all'
        }

        pagination = {
            ...pagination_defaults,
            ...pagination
        }
        
        if(class_name==undefined || class_data == undefined){
            class_data=this.lookup_class(class_id);
            class_name=class_data.name;
        };

        const class_string=`[class_${class_name}]`;

        // joined+added at beginning of the query, built from relations
        const cte_strings=[];

        // joined+added near the end of the query, built from relations
        const cte_joins=[];

        // joined+added between SELECT and FROM, built from relations
        const relation_selections=[];

        const label_prop_ids=class_data.metadata.label?.properties ?? []; 

        // if a property_range is defined, first filter class_data.properties by those IDs
        const retrieved_properties=class_data.properties.filter((prop)=>{
            if(pagination.property_range=='all'||!pagination.property_range){
                return true;
            }else if(pagination.property_range=='slim'){
                return label_prop_ids.includes(prop.id)
            }else if(pagination.property_range.length>0){
               return pagination.property_range.includes(prop.id)
            }else{
                return true;
            }

        })

        const relation_properties=retrieved_properties.filter(a=>a.type=='relation');
        const data_properties=retrieved_properties.filter(a=>a.type=='data');

        for (let prop of relation_properties){
            const target_selects=[];
            let property_junction_column_name=junction_col_name(class_id,prop.id);
    
            if(prop.relation_targets.length>0){
                for(let i = 0; i < prop.relation_targets.length; i++){
    
                    // find the side that does not match both the class and prop IDs
                    let target=prop.relation_targets[i];
                    const target_class=this.class_cache.find((a)=>a.id==target?.class_id);
                    if(target&&target_class){
                        let target_junction_column_name=junction_col_name(target.class_id,target.prop_id);
                        
                        // NOTE: as mentioned elsewhere, possibly allow multiple label props
                        const target_label_id=target_class?.metadata?.label?.properties[0];
                        const target_label=target_class?.properties.find((p)=>p.id==target_label_id);
                        const label_sql_string=target_label?`,'user_${target_label.name}',target_class."user_${target_label.name}"`:'';

                        let junction_id=target.junction_id;
                        let target_select=`
                        SELECT 
                            "${property_junction_column_name}", 
                            json_object('class_id',${target.class_id},'system_id',junction."${target_junction_column_name}"${label_sql_string}) AS target_data, junction.date_added AS date_added
                            FROM junction_${junction_id} AS junction
                            LEFT JOIN "class_${target_class?.name}" AS target_class ON junction."${target_junction_column_name}" =  target_class.system_id
                        `;

                        target_selects.push(target_select);
                    }else{
                        throw Error('Something went wrong trying to retrieve relationship data')
                    }
                    
                }
                
                // uses built-in aggregate json function instead of group_concat craziness
                const cte=`[${prop.id}_cte] AS (
                    SELECT "${property_junction_column_name}", json_group_array( json(target_data) ) AS [user_${prop.name}]
                    FROM 
                    (
                        ${target_selects.join(` 
                        UNION 
                        `)}
                        ORDER BY date_added
                    )
                    GROUP BY "${property_junction_column_name}"

                )`
                
                cte_strings.push(cte);
                relation_selections.push(`[${prop.id}_cte].[user_${prop.name}]`);
                cte_joins.push(`LEFT JOIN [${prop.id}_cte] ON [${prop.id}_cte]."${property_junction_column_name}" = ${class_string}.system_id`)
            }else{
                relation_selections.push(`'[]' AS [user_${prop.name}]`);
            }
            

        }

        let orderby=`ORDER BY ${class_string}.system_order`;

        const data_prop_sql_string=data_properties.map((p)=>`[user_${p.name}]`).join(',');
        const table_selection = pagination.property_range=='all'?`[class_${class_name}].*`:`system_id,system_order,${data_prop_sql_string}`;


        let filter_by_items='';
        if(pagination.item_range && pagination.item_range!=='all' ){
            filter_by_items=`WHERE system_id in (${pagination.item_range.join(',')})`;
        }



        let comma_break=`,
            `

        let query=`
            ${cte_strings.length>0?"WITH "+cte_strings.join(comma_break):''}
            SELECT ${table_selection} ${relation_selections.length>0?', '+relation_selections.join(`, `):''}
            FROM [class_${class_name}]
            ${cte_joins.join(' ')}
            ${filter_by_items}
            ${orderby}`;
        
        // possibly elaborate this any type a little more in the future, e.g. a CellValue or SQLCellValue type that expects some wildcards
        let items=this.db.prepare<[],ClassRow>(query).all();

        let stringified_properties=class_data.properties.filter(a=>a.type=='relation'||can_have_multiple_values(a.max_values));
        items.map((row)=>{
            if(row && typeof row == 'object'){
                for (let prop of stringified_properties){
                    let prop_sql_name='user_'+prop.name;
                    if(prop_sql_name in row){
                        row[prop_sql_name]=JSON.parse(row[prop_sql_name]);
                    }
                  }
            }
        });

        let total=this.db.prepare<[],{total:number}>(`SELECT COUNT(1) AS total FROM ${class_string}`).all()[0]?.total;

        return {
            ...pagination,
            loaded:items,
            total
        };
    }

    
    // MARKER: modify item retrieval
    retrieve_all_classes(
        include:{
            all_items?:ItemPagination;
            items_by_class?:{
                class_id:number;
                pagination:ItemPagination
            }[]
        } = {}
    ):ClassData[]{
        const classes_data=this.run.get_all_classes.all();
        return classes_data.map(({id,name,metadata})=>{

            let properties_sql=this.db.prepare<[],{id:number,type:PropertyType,data_type:'string'| null,max_values:MaxValues,name:string,metadata:string}>(`SELECT * FROM class_${id}_properties`).all() || [];
            
            let properties=properties_sql.map((sql_prop)=>this.parse_sql_prop(id,sql_prop));

            const pagination=include.all_items ?? include.items_by_class?.find(((a)=>a.class_id==id))?.pagination;
            const items = pagination ? this.retrieve_class_items({
                class_id:id,
                class_name:name,
                pagination
            }) : {
                loaded:[],
                total:0
            }

            return {
                id,
                name,
                items,
                properties,
                metadata:JSON.parse(metadata)
            };
        })
    }

    parse_sql_prop(
        class_id:number,
        sql_prop:{
            id:number,
            type:PropertyType,
            data_type:'string'| null,
            max_values:MaxValues,
            name:string,
            metadata:string
        }):(DataProperty | RelationProperty){
            
        if(sql_prop.type=='data'&&defined(sql_prop.data_type)){
            return {
                type:'data',
                id:sql_prop.id,
                name:sql_prop.name,
                max_values:sql_prop.max_values,
                data_type:sql_prop.data_type
            };
        }else if(sql_prop.type=='relation'){
            let associated_junctions=this.run.get_junctions_matching_property.all({class_id:class_id,prop_id:sql_prop.id}) || [];
            let relation_targets=associated_junctions.map((j)=>{
                let sides:JunctionSides=JSON.parse(j.sides);
                // find the side that does not match both the class and prop IDs
                let target=sides.find(a=>!(a.class_id==class_id&&a.prop_id==sql_prop.id));
                if(!target) throw Error('Something went wrong locating target of relationship')
                return {...target,junction_id:j.id};
            })
            return {
                type:'relation',
                id:sql_prop.id,
                name:sql_prop.name,
                max_values:sql_prop.max_values,
                relation_targets
            };
        }else{
            throw Error('property type does not match known types')
        }
    }

    retrieve_windows(){
        const windows_raw=this.run.get_windows.all();
        const windows_parsed:ApplicationWindow[]=windows_raw.map((w)=>{
            return {
                ...w,
                metadata:JSON.parse(w.metadata)
            }
        })
        return windows_parsed;
    }

    retrieve_workspace_contents(id:number){
        // get the workspace table
        let blocks_sql=this.db.prepare<[],SQLWorkspaceBlockRow>(`SELECT * FROM workspace_${id}`).all();
        let blocks:WorkspaceBlock[]=blocks_sql.map(a=>({
            ...a,
            metadata:JSON.parse(a.metadata)
        }))
        
        // for(let block of blocks) block.metadata=JSON.parse(block.metadata);
        // get any relevant root items
        const items=this.db.prepare(`SELECT system_root.* 
            FROM system_root 
            LEFT JOIN workspace_${id} 
            ON system_root.id = workspace_${id}.thing_id
            WHERE workspace_${id}.type = 'item';
        `).all();


        // MARKER: modify item retrieval
        // get any relevant classes
        const items_by_class:{class_id:number,pagination:ItemPagination}[]=blocks.filter((b)=>b.type=='class').map((b)=>({
            class_id:b.thing_id,
            pagination:{
                page_size:null
            }
        }))

        const classes=this.retrieve_all_classes({items_by_class});

        return {
            blocks,
            items,
            classes
        }
    }

    action_config_window({type,open,metadata={pos:[null,null], size:[1000,700]},id}:{
            type:ApplicationWindow["type"],
            open:ApplicationWindow["open"],
            metadata?:ApplicationWindow["metadata"],
            id?:number
        }){
        if(defined(id)){
            this.run.update_window.run({
                id,
                open,
                type,
                meta:JSON.stringify(metadata)
            })
        }else{
 
            let id=this.create_workspace(open,metadata)
            
            return id;
        }

    }


    create_workspace(open:ApplicationWindow["open"],metadata:ApplicationWindow["metadata"]){

        this.run.create_window.run({
            type:'workspace',
            open,
            meta:JSON.stringify(metadata)
        })
        
        let id=this.get_latest_table_row_id('system_windows')
        if(!id) throw Error('Something went wrong creating the window.');
        
        this.create_table('workspace',id,[
            'block_id INTEGER NOT NULL PRIMARY KEY',
            'type TEXT',
            'metadata TEXT',
            'thing_id INTEGER'
        ]);

        return id;
    }

    action_create_workspace_block({workspace_id,type,block_metadata,thing_id}:{
        workspace_id:ApplicationWindow["id"],
        type:WorkspaceBlock["type"],
        block_metadata:WorkspaceBlock["metadata"],
        thing_id:WorkspaceBlock["thing_id"]
    }){
        // should return block id
        this.db.prepare<{type:string,metadata:string,thing_id:number}>(`INSERT INTO workspace_${workspace_id}(type,metadata,thing_id) VALUES (@type,@metadata,@thing_id)`).run({
            type:type,
            metadata:JSON.stringify(block_metadata),
            thing_id
        });
        let block_id=this.db.prepare<[],{block_id:number}>(`SELECT block_id FROM workspace_${workspace_id} ORDER BY block_id DESC`).get()?.block_id;
        if(block_id==undefined) throw Error("Problem adding block to workspace");
        return block_id;

    }

    action_remove_workspace_block({workspace_id,block_id}:{workspace_id:number,block_id:number}){
        this.db.prepare(`DELETE FROM workspace_${workspace_id} WHERE block_id = ${block_id}`).run();
    };

    action_create_and_add_to_workspace({
        workspace_id,
        type,
        block_metadata,
        thing_data
    }:{
        workspace_id:number,
        type:WorkspaceBlock["type"],
        block_metadata:WorkspaceBlock["metadata"],
        thing_data:any // NOTE: fix this in the future when I define class and standalone item types
    }){
        let thing_id;
        // thing creation
        switch(type){
            case 'item':
                let {
                    value:item_value,
                    type:item_type
                } = thing_data;
                thing_id=this.create_item_in_root({type:item_type,value:item_value});
            break;
            // add cases for class and anything else in the future
        }

        if(!thing_id) throw Error('Something went wrong saving an item from a workspace');

        let block_id=this.action_create_workspace_block({
            workspace_id,
            type,
            block_metadata,
            thing_id
        })
        
        return {
            thing_id,
            block_id
        }
        // should return the block id and item id
    }

    action_remove_from_workspace_and_delete(workspace_id:number,block_id:number,type:WorkspaceBlock["type"],thing_id:number){
        this.action_remove_workspace_block({workspace_id,block_id});
        switch(type){
            case 'item':
                this.delete_item_from_root(thing_id);
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
