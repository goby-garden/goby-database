// @ts-nocheck
import Project from './index.js';
// const Project = require('./index.js');

const project=new Project(':memory:');
// const project=new Project('test.db');

//A starting class with a name field
let base_id=project.action_create_class('base');
// console.log(base_id);


// let win_id=project.action_config_window('workspace',1)
// console.log('win_id:',win_id);
// let windows=project.retrieve_windows();
// console.log(windows)

// project.action_add_data_property(base_id,'notes',{max:1},'string')

project.action_edit_class_schema({
    class_changes:[
        {
            action:'create',
            class_id:base_id,
            prop_name:'notes',
            type:'data',
            conditions:{max:1},
            datatype:'string'
        }
    ]
})


let base_item1=project.action_add_row(base_id);
let base_item2=project.action_add_row(base_id);


project.action_edit_class_schema({
    junction_list:[
        {
            sides:[
                {
                    class_id:base_id,
                    prop_name:'test'
                },
                {
                    class_name:'A',
                    prop_name:'prop1'
                }
            ]
        },
        {
            sides:[
                {
                    class_id:base_id,
                    prop_name:'test'
                },
                {
                    class_name:'B',
                    prop_name:'prop1'
                }
            ]
        },
        {
            sides:[
                {
                    class_id:base_id,
                    prop_name:'test'
                },
                {
                    class_name:'C'
                }
            ]
        }
    ],
    class_changes:[
        {
            action:'create',
            class_id:base_id,
            prop_name:'test',
            type:'relation'
        },
        {
            action:'create',
            class_name:'A',
            prop_name:'prop1',
            type:'relation'
        },
        {
            action:'create',
            class_name:'B',
            prop_name:'prop1',
            type:'relation'
        },
        {
            action:'create',
            class_name:'C',
        }
    ]
})



// adding rows
let a_id=project.run.get_class_id.get('A').id;
let a_item1=project.action_add_row(a_id,'A');
let b_id=project.run.get_class_id.get('B').id;
let b_item1=project.action_add_row(b_id,'B');
let b_item2=project.action_add_row(b_id,'B');
let c_id=project.run.get_class_id.get('C').id;
let c_item1=project.action_add_row(c_id,'C');


// making relations
project.action_make_relation({class_id:base_id,prop_id:3,item_id:base_item1},{class_id:a_id,prop_id:2,item_id:a_item1})
project.action_make_relation({ class_id:base_id,prop_id:3,item_id:base_item1},{class_id:b_id,prop_id:2,item_id:b_item1})
project.action_make_relation({class_id:base_id,prop_id:3,item_id:base_item1},{class_id:b_id,prop_id:2,item_id:b_item2})
project.action_make_relation({ class_id:base_id,prop_id:3,item_id:base_item2},{class_id:b_id,prop_id:2,item_id:b_item2})
project.action_make_relation({class_id:base_id,prop_id:3,item_id:base_item1},{class_id:c_id,item_id:c_item1})
project.action_make_relation({class_id:base_id,prop_id:3,item_id:base_item2},{class_id:b_id,prop_id:2,item_id:b_item1})

let junction_list=project.get_junctions();
// console.log(junction_list)

project.action_edit_class_schema({junction_list:[
    junction_list[0],
    {
        sides:[
            {
                class_id:3,
                prop_id:2
            },
            {
                class_id:1
            }
        ]
    }
]})


let classes=project.retrieve_all_classes();
console.log(classes[2])

let ws_id=project.action_config_window('workspace',1)
let ids=project.action_create_and_add_to_workspace(ws_id,'item',{
    pos:[2,2],
    size:[5,17]
},{
    value:'testing!',
    type:'text'
})

console.log(ids);