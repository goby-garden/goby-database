console.log('----------------------------')
console.log('running sandbox test file...')


import Project from './index.js';
const project=new Project(':memory:');

console.log('----------------------------')
console.log('setting up book-author-script schema')
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
console.log(project.junction_cache.map(a=>a.sides));

console.log('----------------------------')
console.log('adding items to classes')
project.action_add_row(1);
project.action_add_row(2);
project.action_add_row(2);
project.action_add_row(3);

console.log('----------------------------')
console.log('making connections between items in classes')
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

project.refresh_caches(['classlist','items','junctions']);


console.log('----------------------------')
console.log('deleting author property in books')
project.action_edit_class_schema(
    {
        property_edits:[
            {
                type:'delete',
                class_id:2,
                prop_id:2
            }
        ]
    }
)
// project.action_edit_class_schema(
//     {
//         property_edits:[
//             {
//                 type:'delete',
//                 class_id:2,
//                 prop_id:2
//             },
//             {
//                 type:'create',
//                 class_id:2,
//                 prop_name:'author2',
//                 config:{
//                     type:'relation',
//                     max_values:1
//                 }
//             }
//         ],
//         relationship_edits:[
//             {type:'create',sides:[{class_id:1,prop_id:3},{class_id:2,prop_name:'author2'}]}
//         ]
//     }
// )

// console.log(project.class_cache[0].items)
console.log(project.junction_cache.map(a=>a.sides));
