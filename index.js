import Database from 'better-sqlite3';

class Project{
    constructor(source){
        // ':memory:'
        this.db= new Database(source);
    
        this.text_datatypes=['string','resource'];
        this.real_datatypes=['number'];
    
        
        //some pre-set sql prepare statements
        


        //checks if goby has been initialized, initializes if not
        const goby_init=this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='system_root'`).get();
        if(!goby_init){
          console.log('initializing goby database');
          this.init();
        }else{
          console.log('opened goby database');
        }

        this.run={
            begin:this.db.prepare('BEGIN IMMEDIATE'),
            commit:this.db.prepare('COMMIT'),
            rollback:this.db.prepare('ROLLBACK'),
            class_meta:this.db.prepare(`SELECT metadata FROM system_classlist WHERE id = ?`),
            junction_meta:this.db.prepare(`SELECT metadata FROM system_junctionlist WHERE id = ?`)
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
        this.create_table('system','junctionlist',['id INTEGER NOT NULL PRIMARY KEY','metadata TEXT']);
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
        if(this.db.inTransaction) this.run.commit.run();
        this.run.begin.run();

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
                    count:'single',
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


    add_data_property(class_id,name,count,style,datatype,default_val){
        let class_meta=this.run.class_meta.get(class_id).metadata;

        let id=Math.max(...class_meta.used_prop_ids)+1;
        class_meta.used_prop_ids.push(id);
        //create JSON for storage in system_classlist
        const prop_meta={ type:'data', name,count,style,datatype,default_val,id};

        //add property to property list 
        class_meta.properties.push(prop_meta);

        let sql_datatype='';

        if(count=='multiple'||this.text_datatypes.includes(datatype)){
            //multiple for data means a stringified array no matter what it is
            sql_datatype='TEXT';
        }else if(this.real_datatypes.includes(datatype)){
            sql_datatype='REAL';
        }
        //create property in table
        let command_string=`ALTER TABLE [class_${class_name}] ADD COLUMN [user_${prop_name}] ${sql_datatype}  ${default_val?('DEFAULT '+default_val):''};`;
        this.db.prepare(command_string).run();

        //update metadata json for table with new property
        this.db.prepare(`UPDATE system_classlist set metadata = '${JSON.stringify(class_meta)}' WHERE id = ${class_id}`).run();
    }

    add_relation_property(class_id,name,count,style,participants,junction_id){
        // basic property construction------------------
        let class_meta=this.run.class_meta.get(class_id).metadata;
        let id=Math.max(...class_meta.used_prop_ids)+1;
        class_meta.used_prop_ids.push(id);



        //create JSON for storage in system_classlist
        const prop_meta={type:'relation', name,count,style,junction_id,default_val,id}
        //add property to property list 
        class_meta.properties.push(prop_meta);

        participants=[
            {
                class_id,
                prop_id:id,
                count:count
            },
            ...participants
        ]

        if(!junction_id){
            //IF no suitable existing junction table, create a new one:
            //sql column strings for create table
            const columns=[];

            //add string for each participant in junction
            for (const el of participants) {
                //if the class doesn't exist yet, create it and return the new class ID
                if(el.class_id==null){
                    el.class_id=this.createTable('class',el.class_name);
                }
                columns.push(`class_${el.class_id} INTEGER`);
            }
        }

        // for each participant:
        // 
        // - if linked, linked property
        // - if linked, define targets for property
        // 
    }



    


}

export default Project;