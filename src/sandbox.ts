console.log('----------------------------')
console.log('running sandbox test file...')


import Project from './index.js';
const project=new Project(':memory:');


//A starting class with a name field
// let base_id=project.action_create_class('base');

console.log('project.class_cache',project.class_cache);


project.action_edit_class_schema({
    class_edits:[
        {type:'create',class_name:'author'},
        {type:'create',class_name:'book'},
        {type:'create',class_name:'script'}
    ],
    property_edits:[
        {type:'create',class_name:'author',prop_name:'age',config:{type:'data',data_type:'number',max_values:1}},
        {type:'create',class_name:'author',prop_name:'works',config:{type:'relation',max_values:null}},
        {type:'create',class_name:'author',prop_name:'books read',config:{type:'relation',max_values:null}},
        {type:'create',class_name:'book',prop_name:'author',config:{type:'relation',max_values:1}}
    ],
    relationship_edits:[
        { type:'create', sides:[{class_name:'author',prop_name:'works'}, {class_name:'book',prop_name:'author'}] },
        { type:'create', sides:[{class_name:'author',prop_name:'works'}, {class_name:'script'}] },
        { type:'create',sides:[{class_name:'author',prop_name:'books read'},{class_name:'book'}]}
    ]
})

project.action_add_row(1);
project.action_add_row(2);
project.action_add_row(2);
project.action_add_row(3);
project.action_make_relation({
    class_id:1,
    prop_id:3,
    item_id:1
},{
    class_id:2,
    prop_id:2,
    item_id:2
})
project.action_make_relation({
    class_id:1,
    prop_id:3,
    item_id:1
},{
    class_id:2,
    prop_id:2,
    item_id:3
})
console.log(project.junction_cache.map(a=>a.sides));
project.action_make_relation({
    class_id:1,
    prop_id:3,
    item_id:1
},{
    class_id:3,
    item_id:4
})
project.action_make_relation({
    class_id:1,
    prop_id:4,
    item_id:1
},{
    class_id:2,
    item_id:2
})
// project.refresh_class_cache();
project.refresh_caches(['classlist','items','junctions']);


console.log('project.class_cache[0]',project.class_cache[0].items);