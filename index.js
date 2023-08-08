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
            get_class:this.db.prepare(`SELECT name, metadata FROM system_classlist WHERE id = ?`),
            get_class_id:this.db.prepare(`SELECT id FROM system_classlist WHERE name = ?`),
            save_class_meta:this.db.prepare(`UPDATE system_classlist set metadata = ? WHERE id = ?`),
            match_junction:this.db.prepare(`SELECT id, side_a, side_b, metadata FROM system_junctionlist WHERE (side_a = @input_1 AND side_b = @input_2 ) OR ( side_a = @input_2 AND side_b = @input_1 )`),
            fuzzy_match_junction:this.db.prepare(`SELECT id, side_a, side_b, metadata FROM system_junctionlist WHERE (side_a LIKE @input_1 AND side_b LIKE @input_2 ) OR ( side_a LIKE @input_2 AND side_b LIKE @input_1 )`)
        }


        
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
        return class_id;

    }


    action_add_data_property(class_id,name,conditions,datatype,style){
        let class_data=this.run.get_class.get(class_id);
        let class_name=class_data.name;
        class_data.metadata=JSON.parse(class_data.metadata)
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
        

    }

    action_add_relation_property(class_id,name,targets,conditions,style){
        // basic property construction------------------
        let class_meta=JSON.parse(this.run.get_class.get(class_id).metadata);
   
        let id=Math.max(...class_meta.used_prop_ids)+1;
        class_meta.used_prop_ids.push(id);
        //create JSON for storage in system_classlist
        const prop_meta={
            type:'relation', 
            name,
            style,
            id,
            targets,
            conditions
        }
        //add property to property list 
        class_meta.properties.push(prop_meta);

        
        
        
        this.run.save_class_meta.run(JSON.stringify(class_meta),class_id);

        this.action_configure_relation(class_id,id,targets,conditions);

        return id;
 
    }


    action_configure_relation(class_id,prop_id,targets,conditions){
        /*targets=[
            {
                class_id:'',
                    // if prop_id is undefined, i.e. new class:
                    class_name:'',
                prop_id:'',
                    // if prop_id is undefined, i.e. new prop in target
                    prop_name:'',
                junction_id:'' // if the junction already exists,
            }
        ]*/
        
        let class_meta=JSON.parse(this.run.get_class.get(class_id).metadata);
        let prop_meta=class_meta.properties.find(a=>a.id==prop_id);
        let old_targets=prop_meta.targets;
        

        targets=targets!==undefined?targets:old_targets;
        conditions=conditions!==undefined?conditions:class_meta.conditions;

        let property_creation_queue=[];
        let property_config_queue=[];

        for(let target of targets){
            //create class if it doesn't exist, and get id
            if(target.class_id==undefined) target.class_id=this.action_create_class(target.class_name);
            let target_class_meta=JSON.parse(this.run.get_class.get(target.class_id).metadata);
            
            // checks if the property doesn't exist and if there's supposed to be a property (i.e., if there's a property_name in the object to be defined)
            if(!target.prop_id&&target.prop_name?.length>0){
                target_class_meta

                //figure out what the next prop id will be
                target.prop_id=Math.max(...target_class_meta.used_prop_ids)+1;

                //add the prop to a list of props that need to be created after the current one is done
                
                property_creation_queue.push({
                    class_id:target.class_id,
                    name:target.prop_name,
                    targets:[
                        {
                            class_id:class_id,
                            prop_id:prop_id
                        }
                    ]
                })
            }else if(target.prop_id!==undefined){
                // NOTE: whether or not prop is new, it needs to be in a queue to be processed, to update its targets and check its conditions
                // the presence of the "targets" in a target determines whether it has already been configured elsewhere
               
                // if(target.targets) property_config_queue.push({
                //     class_id:target.class_id,
                //     prop_id:target.prop_id,
                //     targets:target.targets
                // })

                // change in plans: instead of setting this here, I'm going to update targets based on link/unlink changes below
            }

            if(target.class_name) delete target.class_name;
            if(target.prop_name) delete target.prop_name;


            // junction creation==========================

            let sides={
                input_1: `${class_id}.${prop_id}`,
                input_2:`${target.class_id}.${target.prop_id || ''}`
            }
            target.junction_id=this.run.match_junction.get(sides)?.id;
            
            if(target.junction_id==undefined) target.junction_id=this.create_junction_table(sides);
            
        }

        // compare old targets and current targets
            // loop through old targets and see if any have been deleted, see if any that aren't new became newly linked or unlinked, or linked to a different prop

        let junction_changes=[];
        
        for(let old_target of old_targets){
            if(old_target.class_id){
                let class_match=targets.find(a=>a.class_id==old_target.class_id);

                if(!class_match){
                    junction_changes.push({
                        type:'delete',
                        source:{class_id,prop_id},
                        target:{class_id:old_target.class_id,prop_id:old_target.prop_id}
                    })
                }else if(class_match.prop_id&&!old_target.prop_id){
                    //link previously unlinked
                    junction_changes.push({
                        type:'link',
                        source:{class_id,prop_id},
                        target:{class_id:old_target.class_id,prop_id:class_match.prop_id}
                    })
                }else if(!class_match.prop_id&&old_target.prop_id){
                    //delink previously linked
                    junction_changes.push({
                        type:'unlink',
                        source:{class_id,prop_id},
                        target:{class_id:old_target.class_id,prop_id:old_target.prop_id}
                    })
                }else if(class_match.prop_id!==old_target.prop_id){
                    //transfer link
                    junction_changes.push({
                        type:'transfer link',
                        source:{class_id,prop_id},
                        target:{class_id:class_match.class_id,prop_id:class_match.prop_id},
                        old_target:{class_id:old_target.class_id,prop_id:old_target.prop_id}
                
                    })
                }
            }
            


        }
      

        prop_meta.targets=targets;
        this.run.save_class_meta.run(JSON.stringify(class_meta),class_id);

        // syncing links + garbage collection =========================
        if(junction_changes) this.sync_relations(junction_changes)


        // validation (check conditions) ================
        this.check_conditions(class_id,prop_id,targets,conditions);


        for(let prop of property_creation_queue){
            this.action_add_relation_property(prop.class_id,prop.name,prop.targets);
        }

        for(let prop of property_config_queue){
            //fetch class meta to get targets and conditions
            //run action_configure_relation


         
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


    sync_relations(changes){
        // this function does not create junction tables. it only transfers connections from old junction tables and deletes them.
        /* changes=[
            {
                type:'link',
                participants:[
                    {
                        class_id:1,
                        prop_id:1
                    }
                ]
            }
        ]*/
      
        for(let change of changes){
            let source=change.source;
            let target=change.target;

            let target_class=this.run.get_class.get(target.class_id);
            
            let side_1,side_2,linked;

            let s1_input={
                input_1: `${source.class_id}.${source.prop_id}`,
                input_2:`${target.class_id}.`
            };
            let s2_input={
                input_1: `${target.class_id}.${target.prop_id}`,
                input_2:`${source.class_id}.`
            };

            if(change.type=='link'||change.type=='unlink'||change.type=='transfer link'){
                side_1=this.run.match_junction.get(s1_input);
                side_2=this.run.match_junction.get(s2_input);
                linked=this.run.match_junction.get({
                    input_1: `${source.class_id}.${source.prop_id}`,
                    input_2:`${target.class_id}.${target.prop_id}`
                });
            }


            switch(change.type){
                case 'link':
                    console.log('--> new link')
                    //two properties become linked. either of them may have existing connections to each other's classes, and if so those connections have to be transferred to the link.
                    if(linked){
                        if(side_1){
                            transfer_junction_relations(side_1,linked);
                            delete_junction_table(side_1.id);
                        }
                        
                        if(side_2){
                            transfer_junction_relations(side_1,linked);
                            delete_junction_table(side_2.id);
                        }
                    }
                    // call config_relation to sync other side with updated target (either added the class as a target, or just add the property)
                    {
                        let target_class_meta=JSON.parse(target_class.metadata);
                        let side_2_prop=target_class_meta.properties.find(a=>a.id==target.prop_id);
                        let side_2_source_target=side_2_prop.targets.find(a=>a.class_id==source.class_id);
                        let new_targets;

                        if(!side_2_source_target){
                            side_2_prop.targets.push({
                                class_id:source.class_id,
                                prop_id:source.prop_id
                            })
                            new_targets=side_2_prop.targets;

                        }else if(side_2_source_target.prop_id!==source.prop_id){
                            side_2_source_target.prop_id=source.prop_id;
                            new_targets=side_2_prop.targets;
                        }

                        if(new_targets) this.action_configure_relation(target.class_id,target.prop_id,new_targets);
                    }

                break;
                case 'unlink':
                    //two previously linked properties become de-linked, while possibly staying connected to each other's classes, so the linked connection should be transferred if those tables exist
                    console.log('--> unlinking')
                    
                    if(!side_1){
                        target.junction_id=this.create_junction_table(s1_input);
                        side_1=this.run.match_junction.get(s1_input);
                    }
                    if(!side_2){
                        target.junction_id=this.create_junction_table(s2_input);
                        side_2=this.run.match_junction.get(s2_input);
                    }
                    
                    if(linked){
                        transfer_junction_relations(linked,side_1);
                        transfer_junction_relations(linked,side_2);

                        delete_junction_table(linked.id);
                    }

                    
                    {   
                        // call config_relation to sync other side with updated target (removing the property)
                        if(target_class){
                            let target_class_meta=JSON.parse(target_class.metadata);
                            let side_2_prop=target_class_meta.properties.find(a=>a.id==target.prop_id);
                            let side_2_source_target=side_2_prop.targets.find(a=>a.class_id==source.class_id);
                          
                            if(side_2_source_target.prop_id) {
                                delete side_2_source_target.prop_id;
                                this.action_configure_relation(target.class_id,target.prop_id,side_2_prop.targets);
                                
                            }
                        }
                    }


                break;
                case 'transfer link':
                    console.log('--> transfering link')

                    // let p3=old_participants[1];
                    let old_linked=this.run.match_junction.get({
                        input_1: `${source.class_id}.${source.prop_id}`,
                        input_2:`${old_target.class_id}.${old_target.prop_id}`
                    });
                    transfer_junction_relations(old_linked,linked);



                break;
                case 'delete':
                    console.log('--> deleting target')

                    //a former connection of any kind has been deleted (neither side targets one another), so a table has to be removed
                    let delete_id=this.run.match_junction.get({
                        input_1: `${source.class_id}.${source.prop_id||''}`,
                        input_2:`${target.class_id}.${target.prop_id||''}`
                    })?.id;
                    if(delete_id) delete_junction_table(delete_id);

                    //check if there was a property on second input, if so call configure_relation on it with [targets] updated to make other side of link one-sided
                break;
                
                
            }
        }


    }

    transfer_junction_relations(source,target){
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
        if(class_name==undefined) class_name=this.run.get_class.get(class_id).name;
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
            let class_data=this.run.get_class.get(class_id);
            // console.log(class_data)
            class_name=class_data.name;
            class_meta=JSON.parse(class_data.metadata)
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
        const classes_data=this.db.prepare(`SELECT id, name, metadata FROM system_classlist`).all();
        // console.log(classes)
        let classes=[];
        for(let cls of classes_data){
          classes.push(this.retrieve_class(cls.id,cls.name,JSON.parse(cls.metadata)));
        }

        return classes;
    }


}

export default Project;