import Database from 'better-sqlite3';

class Project{
    constructor(source){
        this.db= new Database(source);
    
        this.text_datatypes=['string','resource'];
        this.real_datatypes=['number'];
        
    
        
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
            get_junctionlist:this.db.prepare('SELECT id, junction_obj(side_a, side_b) AS sides, metadata FROM system_junctionlist'),
            get_class:this.db.prepare(`SELECT name, metadata FROM system_classlist WHERE id = ?`),
            get_class_id:this.db.prepare(`SELECT id FROM system_classlist WHERE name = ?`),
            get_all_classes:this.db.prepare(`SELECT id, name, metadata FROM system_classlist`),
            save_class_meta:this.db.prepare(`UPDATE system_classlist set metadata = ? WHERE id = ?`),
            match_junction:this.db.prepare(`SELECT id, side_a, side_b, metadata FROM system_junctionlist WHERE (side_a = @input_1 AND side_b = @input_2 ) OR ( side_a = @input_2 AND side_b = @input_1 )`),
            fuzzy_match_junction:this.db.prepare(`SELECT id, side_a, side_b, metadata FROM system_junctionlist WHERE (side_a LIKE @input_1 AND side_b LIKE @input_2 ) OR ( side_a LIKE @input_2 AND side_b LIKE @input_1 )`)
        }

        


        this.class_cache={};
        this.refresh_class_cache();
        this.junction_cache=[];
        this.refresh_junction_cache();
        // this.junction_cache;
        
        //if I understand transactions correctly, a new one will begin with every user action while committing the one before, meaning I'll need to have the first begin here
        //this enables a one-step undo.
        // this.run.begin.run();
        
    }

    

    init(){


        //System table to contain all objects in the project.
        this.create_table('system','root',['id INTEGER NOT NULL PRIMARY KEY']);
        
    
        //System table to contain metadata for all classes created by user
        this.create_table('system','classlist',['id INTEGER NOT NULL PRIMARY KEY','name TEXT','metadata TEXT']);
        //System table to contain all the junction tables and aggregate info about relations
        this.create_table('system','junctionlist',['id INTEGER NOT NULL PRIMARY KEY','side_a TEXT','side_b TEXT','metadata TEXT']);
        //System table to contain generated image data
        this.create_table('system','images',['file_path TEXT','img_type TEXT','img BLOB']);
        
        // [TO ADD: special junction table for root objects to reference themselves in individual relation]
        this.create_table('system','junction_root',[
            'id_1 INTEGER',
            'id_2 INTEGER',
            'metadata TEXT'
        ]);

        this.db.function('junction_obj', (side_a, side_b) => {
            
            let split_1=side_a.split('.');
            let split_2=side_b.split('.');
            let c1=`"class_id":${split_1[0]}`;
            let p1=split_1[1]?`,"prop_id":${split_1[1]}`:'';
            let c2=`"class_id":${split_2[0]}`;
            let p2=split_2[1]?`,"prop_id":${split_2[1]}`:'';
            return `[ {${c1}${p1}}, {${c2}${p2}} ]`;
        });
   
        
    }


    refresh_class_cache(){
        let class_array=this.run.get_all_classes.all();
        let cache_obj={};
        for(let cls of class_array){
            cache_obj[cls.id]={
                id:cls.id,
                name:cls.name,
                metadata:JSON.parse(cls.metadata)
            };

        }
        this.class_cache=cache_obj;
    }

    refresh_junction_cache(){
        let junction_list=this.run.get_junctionlist.all();
        junction_list.map(a=>a.sides=JSON.parse(a.sides));
        this.junction_cache=junction_list;
    }

      

    create_table(type,name,columns){
        //type will pass in 'class', 'system', or 'junction' to use as a name prefix
        //columns is an array of raw SQL column strings
        
    
        let columns_string=columns.join(',');

        //name in brackets to allow special characters
        // validation test: what happens if there are brackets in the name?
        const sqlname=type=='class'?`[class_${name}]`:`${type}_${name}`;
        let create_statement=`CREATE TABLE ${sqlname}(
          ${columns_string}
        )`;
        this.db.prepare(create_statement).run();
        

    }

    action_create_class(name,meta){
        // if(this.db.inTransaction) this.run.commit.run();
        // this.run.begin.run();

        //a class starts with these basic columns
        let columns=['system_id INTEGER UNIQUE',
        'system_order INTEGER','user_name TEXT',`FOREIGN KEY(system_id) REFERENCES system_root(id)`];

        this.create_table('class',name,columns);

        const table_meta={
            properties:[
                {
                    name:'name',
                    type:'data',
                    id:1,
                    datatype:'string',
                    conditions:{
                        max:1
                    },
                    style:{
                        display:true,
                        colwidth:4
                    }
                }
            ],
            used_prop_ids:[1],
            style:{
                color:'#b5ffd5',
                display:meta?.display || true,
                position:meta?.position || [0,0]
            }
        };

        this.db.prepare(`INSERT INTO system_classlist (name, metadata) VALUES ('${name}','${JSON.stringify(table_meta)}')`).run();
        //get the id of newest value from system_classlist and return
        const class_id=this.db.prepare('SELECT id FROM system_classlist ORDER BY id DESC').get().id;

        this.refresh_class_cache();
        this.refresh_junction_cache();

        return class_id;
        

    }


    action_add_data_property(class_id,name,conditions,datatype,style){
     
        let class_data=this.class_cache[class_id];
        let class_name=class_data.name;
        let class_meta=class_data.metadata;
        
        let id=Math.max(...class_meta.used_prop_ids)+1;
        class_meta.used_prop_ids.push(id);
        //create JSON for storage in system_classlist
        const prop_meta={ type:'data', name,conditions,style,datatype,id};

        //add property to property list 
        class_meta.properties.push(prop_meta);

        let sql_datatype='';

        if(conditions.max>1||this.text_datatypes.includes(datatype)){
            //multiple for data means a stringified array no matter what it is
            sql_datatype='TEXT';
        }else if(this.real_datatypes.includes(datatype)){
            sql_datatype='REAL';
        }
        //create property in table
        let command_string=`ALTER TABLE [class_${class_name}] ADD COLUMN [user_${name}] ${sql_datatype};`;
        this.db.prepare(command_string).run();

        //update metadata json for table with new property
        this.run.save_class_meta.run(JSON.stringify(class_meta),class_id);
        this.refresh_class_cache();
        

    }

    action_add_relation_property(class_id,name,conditions,style){
        // basic property construction------------------
        let class_meta=this.class_cache[class_id].metadata;
   
        let id=Math.max(...class_meta.used_prop_ids)+1;
        class_meta.used_prop_ids.push(id);
        //create JSON for storage in system_classlist
        const prop_meta={
            type:'relation', 
            name,
            style,
            id,
            targets:[],
            conditions
        }
        //add property to property list 
        class_meta.properties.push(prop_meta);


        this.run.save_class_meta.run(JSON.stringify(class_meta),class_id);
        this.refresh_class_cache();

        return id;
 
    }


    delete_property(class_id,prop_id){
        //this function is meant to be used within a flow where the relations that need to change as a result of this deletion are already kept track of

        let class_meta=this.class_cache[class_id].metadata;
        let i=class_meta.properties.findIndex(a=>a.id==prop_id);
        class_meta.properties.splice(i,1);
        this.run.save_class_meta.run(JSON.stringify(class_meta),class_id.id);
        this.refresh_class_cache();
    }

    get_junctions(){
        let junction_list=this.run.get_junctionlist.all();
        junction_list.map(a=>a.sides=JSON.parse(a.sides))
        return junction_list;
    }


    // action_edit_structure(property_changes=[],junction_list){
    //     // 
    // }


    action_update_relations(junction_list,target_changes=[]){

        // STEP 1 ============================
        // create any new classes and/or properties and retrieve their ids, add them to junction_list where they appear

        for(let target of target_changes){

            
            if(target.change=='create'){
                if(target.class_id==undefined) target.class_id=this.action_create_class(target.class_name);
                junction_list.map(junction=>{
                    let matching=junction.sides.find(
                        side=>side.class_name==target.class_name);
                    if(matching) matching.class_id=target.class_id;
                })

                if(target.prop_name!==undefined){
                    target.prop_id=this.action_add_relation_property(target.class_id,target.prop_name);
                    junction_list.map(junction=>{
                        let matching=junction.sides.find(
                            side=>side.class_id==target.class_id&&side.prop_name==target.prop_name);
                        if(matching) matching.prop_id=target.prop_id;
                    })
                }
            }else if(target.change=='delete'){
                delete_property(target.class_id,target.prop_id);
            }

            

        }

        let classes_meta=this.class_cache;


        // STEP 2 ============================
        // find all the old junctions which don't appear in the new list
        // add them to a "delete_queue" to schedule them for deletion
        // remove the corresponding targets from the properties they reference

        let delete_queue=[];
        let old_junction_list=this.get_junctions();
        


        for(let junction of old_junction_list){
            
            let s1=junction.sides[0]
            let s2=junction.sides[1];
       
            let matching=junction_list.find(a=>junction_match(a.sides,junction.sides));

            
            if(matching==undefined){
                if(s1.prop_id) remove_target(s1,s2);
                if(s2.prop_id) remove_target(s2,s1);
                delete_queue.push(junction);
            }
            
            

            //delete queue junctions will need to have the targets removed (or left be, if the prop target doesn't match) from their respective props
        
            
            
        }

        
        // STEP 3 ============================
        // a) find all the junctions in the new list that don't appear in the old one
        // b) this means they need to be newly created
        // c) the corresponding targets need to be registered in any referenced properties
        // d) we check if there are any former tables which share at least one of the same properties, and we transfer their properties

        
        for(let junction of junction_list){
            let s1=junction.sides[0];
            let s2=junction.sides[1];
            

            // a)
            let matching=old_junction_list.find(a=>junction_match(a.sides,junction.sides));
           
            if(matching==undefined){

                // b)
                // create the new table
                let j_sides={
                    input_1: `${s1.class_id}.${s1.prop_id || ''}`,
                    input_2:`${s2.class_id}.${s2.prop_id || ''}`
                }
                
                let junction_id=this.create_junction_table(j_sides);

                // c)
                
                if(s1.prop_id) add_target(s1,s2,junction_id);
                if(s2.prop_id) add_target(s2,s1,junction_id);

                let j_object={
                    side_a:j_sides.input_1,
                    side_b:j_sides.input_2,
                    id:junction_id
                };

                // d)
                // look for any tables in the delete pile that pair the same classes and have the same property on one side. If any exist, transfer the connections from the old tables
                let partial_matches=delete_queue.filter(a=>partial_junction_match(a.sides,junction.sides));
                
                
                for(let partial of partial_matches){
                    let p_object={
                        id:partial.id,
                        side_a:`${partial.sides[0].class_id}.${partial.sides[0].prop_id || ''}`,
                        side_b:`${partial.sides[1].class_id}.${partial.sides[1].prop_id || ''}`
                    }
                    this.transfer_connections(p_object,j_object);
                }

            }
        }

        // STEP 4 ============================ 
        // delete the tables in the delete pile
        for(let junction of delete_queue){
            this.delete_junction_table(junction.id);
        }
        

        // STEP 5 ============================ 
        // submit all prop updates to class_meta
        let modified_classes=Object.entries(classes_meta).filter(a=>a[1].modified).map(a=>a[1]);
       
        for(let modified of modified_classes) this.run.save_class_meta.run(JSON.stringify(modified.metadata),modified.id);


        this.refresh_class_cache();
        // STEP 6 (TBD) ===================
        // check if the connections in the new tables follow the conditons of their corresponding properties, and remove any that don't pass muster

        

        
        // ======================== utility functions ============================
        function side_match(x,y){
            return x.class_id==y.class_id&&x.prop_id==y.prop_id;
        };
        
        
        function junction_match(a,b){
            // match sides completely, order doesn't matter
            return (side_match(a[0],b[0])&&side_match(a[1],b[1])) ||
                   (side_match(a[0],b[1])&&side_match(a[1],b[0]));

        }

        function partial_junction_match(a,b){
            
           // match both classes
            // match at least one prop
            let a0_match_i=b.findIndex(side=>a[0].class_id==side.class_id);
            let a1_match_i=b.findIndex(side=>a[1].class_id==side.class_id);
            if(a0_match_i>=0&&a1_match_i>=0&&a0_match_i!==a1_match_i){
                return b[a0_match_i].prop_id==a[0].prop_id||
                       b[a1_match_i].prop_id==a[1].prop_id
            }else{
                return false;
            }
            
        }
        

        function remove_target(prop,target){
            let prop_class=classes_meta[prop.class_id];
            
            let class_meta=prop_class.metadata;
            
            let prop_meta=class_meta.properties.find(a=>a.id==prop.prop_id);
            
            if(prop_meta){
                let target_index=prop_meta.targets.findIndex(a=>side_match(a,target));
                if(target_index>=0) prop_meta.targets.splice(target_index,1);
                prop_class.modified=true;
            }
        }

        function add_target(prop,target,junction_id){
            let prop_class=classes_meta[prop.class_id]
            let class_meta=prop_class.metadata
            
            let prop_meta=class_meta.properties.find(a=>a.id==prop.prop_id);
            
            if(prop_meta){
                let obj={
                    class_id:target.class_id,
                    junction_id:junction_id
                }
                if(target.prop_id!==undefined) obj.prop_id=target.prop_id;
                prop_meta.targets.push(obj)
             
                prop_class.modified=true;
                
            }
        }
        

    }

    
    create_junction_table(sides){
        // adds new record to junction table
        this.db.prepare(`INSERT INTO system_junctionlist (side_a, side_b) VALUES ('${sides.input_1}','${sides.input_2}')`).run();

        //gets id of new record
        let id=this.db.prepare('SELECT id FROM system_junctionlist ORDER BY id DESC').get().id;

        // creates table
        this.create_table('junction',id,[
            `"${sides.input_1}" INTEGER`,
            `"${sides.input_2}" INTEGER`
        ]);

        return id;
    }


    transfer_connections(source,target){
        
        let source_relations=this.db.prepare(`SELECT * FROM junction_${source.id}`).all();
        
        //have to match source sides to target sides in order to determine junction order
        let source_sides=source.side_a.split('.')[0] == target.side_a.split('.')[0]?
            [source.side_a,source.side_b]:[source.side_b,source.side_a];

        for(let relation of source_relations){
            
            this.db.prepare(`INSERT INTO junction_${target.id}("${target.side_a}","${target.side_b}") 
            VALUES(${ relation[source_sides[0]]},${ relation[source_sides[1]]})`).run();
        }
    }

    delete_junction_table(id){
        this.db.prepare(`DELETE FROM system_junctionlist WHERE id = ${id}`).run();
        this.db.prepare(`DROP TABLE junction_${id}`).run();
    }

    check_conditions(class_id,prop_id,targets,conditions){
        /*  conditions={
            max: integer or undefined,
            filters:[

            ],
            rules:[

            ]
        }

            for now not gonna deal with filters or rules, just going to check max
        */

        let cls=this.retrieve_class(class_id);
        let prop_name='user_'+cls.metadata.properties.find(a=>a.id==prop_id).name;
        for(let object of cls.objects){
            let prop_values=object[prop_name];
            console.log(prop_name,prop_values);
        }

        // this is going to require writing the new retrieval function.


    }

    action_save(){
        if(this.db.inTransaction) this.run.commit.run();
        this.db.close();
    }
    

    action_add_row(class_id,class_name){
        //first add new row to root and get id
        if(class_name==undefined) class_name=this.class_cache[class_id].name;
        // console.log(class_name)
        this.db.prepare('INSERT INTO system_root VALUES (null)').run();
        const root_id=this.db.prepare('SELECT id FROM system_root ORDER BY id DESC').get().id;

        //get the last item in class table order and use it to get the order for the new item
        const last_order=this.db.prepare(`SELECT system_order FROM [class_${class_name}] ORDER BY system_order DESC`).get();
        const new_order=last_order?last_order.system_order+1:1;
   
        this.db.prepare(`INSERT INTO [class_${class_name}] (system_id, system_order) VALUES (${root_id},${new_order})`).run();

        return root_id;
    }

    action_make_relation(input_1,input_2){
        /* input = {
            class_id: INT,
            prop_id: INT,
            object_id: INT
        }
        */

        let sides={
            input_1:`${input_1.class_id}.${input_1.prop_id || ''}`,
            input_2:`${input_2.class_id}.${input_2.prop_id || ''}`
        }
        let junction_id=this.run.match_junction.get(sides)?.id;
        this.db.prepare(`INSERT INTO junction_${junction_id} ("${sides.input_1}", "${sides.input_2}") VALUES (${input_1.object_id},${input_2.object_id})`).run();
        
    }


    retrieve_class(class_id,class_name,class_meta){
        if(class_name==undefined){
            let class_data=this.class_cache[class_id];
            // console.log(class_data)
            class_name=class_data.name;
            class_meta=class_data.metadata;
        };

        const class_string=`[class_${class_name}]`;

        // //joined+added at beginning of the query, built from relations
        const cte_strings=[];

        // //joined+added near the end of the query, built from relations
        const cte_joins=[];

        // //joined+added between SELECT and FROM, built from relations
        const relation_selections=[];

        let relation_properties=class_meta.properties.filter(a=>a.type=='relation');

        for (let prop of relation_properties){
            const target_selects=[];
            const target_joins=[];
            let p_side=`${class_id}.${prop.id}`;
            let first=prop.targets[0];

            for(let i = 0; i < prop.targets.length; i++){
                let target=prop.targets[i];
                let t_side=`${target.class_id}.${target.prop_id || ''}`;

                let target_select=`
                SELECT "${p_side}", json_object('target_id','${target.class_id}','id',"${t_side}") AS json_object
                FROM junction_${target.junction_id}`
                target_selects.push(target_select);
            }

            const cte=`[${prop.id}_cte] AS (
                SELECT "${p_side}", ('[' || GROUP_CONCAT(json_object,',') || ']') AS [user_${prop.name}]
                FROM (${target_selects.join(' UNION ')})
                GROUP BY "${p_side}"
            )`
            
            cte_strings.push(cte);
            relation_selections.push(`[${prop.id}_cte].[user_${prop.name}]`);
            cte_joins.push(`LEFT JOIN [${prop.id}_cte] ON [${prop.id}_cte]."${p_side}" = ${class_string}.system_id`)

        }

        let orderby=`ORDER BY ${class_string}.system_order`;

        let query=`
            ${cte_strings.length>0?"WITH "+cte_strings.join(','):''}
            SELECT [class_${class_name}].* ${cte_strings.length>0?', '+relation_selections.join(`, `):''}
            FROM [class_${class_name}]
            ${cte_joins.join(' ')}
            ${orderby}`;
        
        let objects=this.db.prepare(query).all();

        let stringified_properties=class_meta.properties.filter(a=>a.type=='relation'||a.conditions?.max>1);
        objects.map(row=>{
          for (let prop of stringified_properties){
            row['user_'+prop.name]=JSON.parse(row['user_'+prop.name]);
          }
        })
        return {
            objects,
            metadata:class_meta,
            name:class_name
        };
    }

    retrieve_all_classes(){
        const classes_data=this.run.get_all_classes.all();
        // console.log(classes)
        let classes=[];
        for(let cls of classes_data){
          classes.push(this.retrieve_class(cls.id,cls.name,JSON.parse(cls.metadata)));
        }

        return classes;
    }


}

export default Project;