
import Project from './index.js';

// const project=new Project(':memory:');
const project=new Project('test.db');

//A starting class with a name field
let c1_id=project.action_create_class('class 1');
// console.log(c1_id);

project.action_add_data_property(c1_id,'notes',{max:1},'string')
let c1_item1=project.action_add_row(c1_id);

project.action_add_relation_property(
    // class id
    c1_id,
    // name of prop
    'test',
    // targets
    [
        {
            class_name:'class 2',
            prop_name:'test link'
        }
    ]
)

let c2_item1=project.action_add_row(undefined,'class 2');
let c2_id=project.run.get_class_id.get('class 2').id;

project.action_make_relation(
    {
        class_id:c1_id,
        prop_id:3,
        object_id:c1_item1
    },
    {
        class_id:c2_id,
        prop_id:2,
        object_id:c2_item1
    }
)


// project.action_save();