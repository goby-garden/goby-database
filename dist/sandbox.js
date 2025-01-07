var _a, _b, _c;
console.log('----------------------------');
console.log('running sandbox test file...');
import Project from './index.js';
const project = new Project(':memory:');
//A starting class with a name field
let base_id = project.action_create_class('base');
console.log('project.class_cache', project.class_cache);
project.action_edit_class_schema({
    class_changes: [
        {
            action: 'create',
            class_id: base_id,
            prop_name: 'notes',
            type: 'data',
            max_values: 1,
            data_type: 'string'
        }
    ]
});
let base_item1 = project.action_add_row(base_id);
let base_item2 = project.action_add_row(base_id);
//creating a schema
project.action_edit_class_schema({
    staged_junctions: [
        {
            sides: [
                {
                    class_id: base_id,
                    prop_name: 'test'
                },
                {
                    class_name: 'A',
                    prop_name: 'prop1'
                }
            ]
        },
        {
            sides: [
                {
                    class_id: base_id,
                    prop_name: 'test'
                },
                {
                    class_name: 'B',
                    prop_name: 'prop1'
                }
            ]
        },
        {
            sides: [
                {
                    class_id: base_id,
                    prop_name: 'test'
                },
                {
                    class_name: 'C'
                }
            ]
        }
    ],
    class_changes: [
        {
            action: 'create',
            class_id: base_id,
            prop_name: 'test',
            type: 'relation'
        },
        {
            action: 'create',
            class_name: 'A',
            prop_name: 'prop1',
            type: 'relation'
        },
        {
            action: 'create',
            class_name: 'B',
            prop_name: 'prop1',
            type: 'relation'
        },
        {
            action: 'create',
            class_name: 'C',
        }
    ]
});
// getting class IDs
let a_id = (_a = project.run.get_class_id.get('A')) === null || _a === void 0 ? void 0 : _a.id;
let b_id = (_b = project.run.get_class_id.get('B')) === null || _b === void 0 ? void 0 : _b.id;
let c_id = (_c = project.run.get_class_id.get('C')) === null || _c === void 0 ? void 0 : _c.id;
if (a_id && b_id && c_id) {
    // adding rows
    let a_item1 = project.action_add_row(a_id);
    let b_item1 = project.action_add_row(b_id);
    let b_item2 = project.action_add_row(b_id);
    let c_item1 = project.action_add_row(c_id);
    // making relations
    project.action_make_relation({ class_id: base_id, prop_id: 3, item_id: base_item1 }, { class_id: a_id, prop_id: 2, item_id: a_item1 });
    project.action_make_relation({ class_id: base_id, prop_id: 3, item_id: base_item1 }, { class_id: b_id, prop_id: 2, item_id: b_item1 });
    project.action_make_relation({ class_id: base_id, prop_id: 3, item_id: base_item1 }, { class_id: b_id, prop_id: 2, item_id: b_item2 });
    project.action_make_relation({ class_id: base_id, prop_id: 3, item_id: base_item2 }, { class_id: b_id, prop_id: 2, item_id: b_item2 });
    project.action_make_relation({ class_id: base_id, prop_id: 3, item_id: base_item1 }, { class_id: c_id, item_id: c_item1 });
    project.action_make_relation({ class_id: base_id, prop_id: 3, item_id: base_item2 }, { class_id: b_id, prop_id: 2, item_id: b_item1 });
}
let junction_list = project.get_junctions();
// console.log(junction_list)
project.action_edit_class_schema({ staged_junctions: [
        junction_list[0],
        {
            sides: [
                {
                    class_id: 3,
                    prop_id: 2
                },
                {
                    class_id: 1
                }
            ]
        }
    ] });
let classes = project.retrieve_all_classes();
console.log(classes[2]);
// let ws_id=project.action_config_window('workspace',1)
// let ids=project.action_create_and_add_to_workspace(ws_id,'item',{
//     pos:[2,2],
//     size:[5,17]
// },{
//     value:'testing!',
//     type:'text'
// })
// console.log(ids);
//# sourceMappingURL=sandbox.js.map