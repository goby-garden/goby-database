
import Project from './index.js';

const project=new Project(':memory:');
// const project=new Project('test.db');

//A starting class with a name field
let base_id=project.action_create_class('base');
// console.log(base_id);

project.action_add_data_property(base_id,'notes',{max:1},'string')
let base_item1=project.action_add_row(base_id);
let base_item2=project.action_add_row(base_id);

let base_relation_id=project.action_add_relation_property(
    // class id
    base_id,
    // name of prop
    'test',
    // targets
    [
        {
            class_name:'A',
            prop_name:'prop1'
        },
        {
            class_name:'B',
            prop_name:'prop1'
        },
        {
            class_name:'C'
        }
    ]
)

// adding rows
let a_item1=project.action_add_row(undefined,'A');
let a_id=project.run.get_class_id.get('A').id;
let b_item1=project.action_add_row(undefined,'B');
let b_id=project.run.get_class_id.get('B').id;
let b_item2=project.action_add_row(undefined,'B');
let c_item1=project.action_add_row(undefined,'C');
let c_id=project.run.get_class_id.get('C').id;

// making relations
project.action_make_relation({class_id:base_id,prop_id:3,object_id:base_item1},{class_id:a_id,prop_id:2,object_id:a_item1})
project.action_make_relation({ class_id:base_id,prop_id:3,object_id:base_item1},{class_id:b_id,prop_id:2,object_id:b_item1})
project.action_make_relation({class_id:base_id,prop_id:3,object_id:base_item1},{class_id:b_id,prop_id:2,object_id:b_item2})
project.action_make_relation({ class_id:base_id,prop_id:3,object_id:base_item2},{class_id:b_id,prop_id:2,object_id:b_item2})
project.action_make_relation({class_id:base_id,prop_id:3,object_id:base_item1},{class_id:c_id,object_id:c_item1})
project.action_make_relation({class_id:base_id,prop_id:3,object_id:base_item2},{class_id:b_id,prop_id:2,object_id:b_item1})


console.log(base_relation_id)
// action_configure_relation(base_id,base_relation_id,[
//     {

//     }
// ])


let classes=project.retrieve_all_classes();
// console.log(classes[0].metadata)

// project.action_save();