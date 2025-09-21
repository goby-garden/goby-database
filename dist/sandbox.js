var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { readable_junctionlist } from "./utils.js";
import Project from "./index.js";
import { tsvParse } from "d3-dsv";
import { readFileSync, existsSync } from "node:fs";
import { defined, partial_relation_match } from "./utils.js";
const [, , arg] = process.argv;
function delay(duration) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(true);
        }, duration);
    });
}
if (arg) {
    log_step(`running ${arg} test...`, 1);
    switch (arg) {
        case "in-memory":
            in_memory_tests();
            break;
        case "groceries":
            create_groceries_project();
            break;
        case "grocery-queries":
            grocery_queries();
            break;
        case "unit-relation-matching":
            test_relation_matching();
            break;
        default:
            console.log(`no such test "${arg}" exists`);
            break;
    }
}
else {
    console.log("no test provided");
}
function create_groceries_project() {
    return __awaiter(this, arguments, void 0, function* (log_only = false, delay_time = 0) {
        var _a, _b, _c, _d, _e, _f, _g;
        const write_to_db = !log_only;
        const d = new Date();
        const d_string = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}_${d.getHours()}.${d.getMinutes()}`;
        const db_path = `test_data/db/groceries_${d_string}.db`;
        if (!existsSync(db_path) || !write_to_db) {
            const project = new Project(!write_to_db ? ":memory:" : db_path);
            const tables = [
                {
                    title: "Recipes",
                    tsv: "test_data/groceries-recipes.tsv",
                    tsv_parsed: [],
                    properties: [
                        { name: "Name", type: "string", max_values: 1 },
                        { name: "Ingredients", type: "relation", max_values: null },
                        { name: "Nice-to-have", type: "relation", max_values: null },
                        { name: "Recipe", type: "resource", max_values: 1 },
                        { name: "Meal", type: "relation", max_values: null },
                        { name: "Enjoyers", type: "relation", max_values: null },
                    ],
                },
                {
                    title: "Ingredients",
                    tsv: "test_data/groceries-ingredients.tsv",
                    tsv_parsed: [],
                    properties: [
                        { name: "Name", type: "string", max_values: 1 },
                        { name: "Stocked", type: "boolean", max_values: 1 },
                        { name: "Used in", type: "relation", max_values: null },
                        { name: "Snackable", type: "boolean", max_values: 1 },
                        { name: "Category", type: "relation", max_values: 1 },
                    ],
                },
                {
                    title: "Ingredient categories",
                    tsv: "test_data/groceries-ingredient-categories.tsv",
                    tsv_parsed: [],
                    properties: [{ name: "Name", type: "string", max_values: 1 }],
                },
                {
                    title: "Meal types",
                    tsv: "test_data/groceries-meal-types.tsv",
                    properties: [{ name: "Name", type: "string", max_values: 1 }],
                },
                {
                    title: "Enjoyers",
                    tsv: "test_data/enjoyers.tsv",
                    tsv_parsed: [],
                    properties: [{ name: "Name", type: "string", max_values: 1 }],
                },
            ];
            log_step('Creating class schema');
            project.action_edit_class_schema({
                class_edits: tables.map((t) => ({
                    type: "create",
                    class_name: t.title,
                })),
                property_edits: tables.flatMap((table) => {
                    return table.properties
                        .filter((prop) => prop.name !== "Name")
                        .map((prop) => {
                        return {
                            type: "create",
                            prop_name: prop.name,
                            class_name: table.title,
                            config: prop.type == "relation"
                                ? {
                                    type: "relation",
                                    max_values: prop.max_values,
                                }
                                : {
                                    type: "data",
                                    data_type: prop.type,
                                    max_values: prop.max_values,
                                },
                        };
                    });
                }),
                relationship_edits: [
                    {
                        type: "create",
                        sides: [
                            { class_name: "Recipes", prop_name: "Ingredients" },
                            { class_name: "Ingredients", prop_name: "Used in" },
                        ],
                    },
                    {
                        type: "create",
                        sides: [
                            { class_name: "Recipes", prop_name: "Ingredients" },
                            { class_name: "Recipes" },
                        ],
                    },
                    {
                        type: "create",
                        sides: [
                            { class_name: "Recipes", prop_name: "Nice-to-have" },
                            { class_name: "Ingredients" },
                        ],
                    },
                    {
                        type: "create",
                        sides: [
                            { class_name: "Recipes", prop_name: "Nice-to-have" },
                            { class_name: "Recipes" },
                        ],
                    },
                    {
                        type: "create",
                        sides: [
                            { class_name: "Recipes", prop_name: "Meal" },
                            { class_name: "Meal types" },
                        ],
                    },
                    {
                        type: "create",
                        sides: [
                            { class_name: "Ingredients", prop_name: "Category" },
                            { class_name: "Ingredient categories" },
                        ],
                    },
                    {
                        type: "create",
                        sides: [
                            { class_name: "Recipes", prop_name: "Enjoyers" },
                            { class_name: "Enjoyers" },
                        ],
                    }
                ],
            });
            // gets the class metadata but no items by defuault
            let classes = project.retrieve_all_classes();
            log_step('Populating classes from table row data');
            for (let table of tables) {
                const class_data = classes.find((c) => c.name == table.title);
                table.class_data = class_data;
                if (table.tsv && class_data) {
                    const class_id = class_data.id;
                    const data_cols = table.properties
                        .filter((p) => p.type !== "relation")
                        .map(({ name }) => {
                        const prop = class_data.properties.find((p) => p.name == name);
                        if (!prop)
                            throw Error("Could not find property matching this name");
                        return {
                            property_id: prop.id,
                            name,
                        };
                    });
                    const tsv = readFileSync(table.tsv, "utf8");
                    const rows = tsvParse(tsv);
                    table.tsv_parsed = rows;
                    for (let row of rows) {
                        const changes = data_cols.map(({ name, property_id }) => ({
                            property_id,
                            value: row[name] == "FALSE"
                                ? false
                                : row[name] == "TRUE"
                                    ? true
                                    : row[name],
                        }));
                        project.action_add_row(class_id, changes);
                    }
                }
            }
            log_step("Looping through tables to make relations...");
            // re-fetches classes, this time including all the items
            classes = project.retrieve_all_classes({
                all_items: { page_size: null }
            });
            const recipes = classes.find((cls) => cls.name == "Recipes");
            const ingredients = classes.find((cls) => cls.name == "Ingredients");
            const enjoyers = classes.find((cls) => cls.name == "Enjoyers");
            const meals = classes.find((cls) => cls.name == "Meal types");
            const ingredient_type = classes.find((cls) => cls.name == "Ingredient categories");
            const targets = {
                Ingredients: [{
                        class: ingredients,
                        prop: (_a = ingredients === null || ingredients === void 0 ? void 0 : ingredients.properties) === null || _a === void 0 ? void 0 : _a.find((a) => a.name == "Used in"),
                    }, {
                        class: recipes
                    }],
                "Nice-to-have": [{ class: ingredients }],
                Enjoyers: [{ class: enjoyers }],
                Meal: [{ class: meals }],
                Category: [{ class: ingredient_type }],
            };
            for (let { properties, tsv_parsed, class_data } of tables) {
                if (tsv_parsed && defined(class_data)) {
                    const class_id = class_data.id;
                    class_data.items = project.retrieve_class_items({
                        class_id
                    });
                    for (let prop of properties.filter((p) => p.type == "relation")) {
                        const prop_id = (_b = class_data.properties.find((a) => a.name == prop.name)) === null || _b === void 0 ? void 0 : _b.id;
                        const target_classes = targets[prop.name] || [];
                        console.log('target_classes', target_classes);
                        for (let target of target_classes) {
                            if (target && target.class && defined(prop_id)) {
                                console.log('\nprop:', `${class_data.name} / ${prop.name}`);
                                console.log('target:', `${target.class.name} ${((_c = target.prop) === null || _c === void 0 ? void 0 : _c.name) ? '/ ' + ((_d = target.prop) === null || _d === void 0 ? void 0 : _d.name) : ''}`);
                                const target_obj = Object.assign({ class_id: target.class.id }, (target.prop ? { prop_id: target.prop.id } : {}));
                                for (let row of tsv_parsed) {
                                    const item = class_data.items.loaded.find((i) => i.user_Name == row.Name);
                                    if (item) {
                                        const selected_strings = ((_f = (_e = row[prop.name]) === null || _e === void 0 ? void 0 : _e.split(",")) === null || _f === void 0 ? void 0 : _f.map((a) => a.trim())) ||
                                            [];
                                        const selected = target.class.items.loaded.filter((a) => selected_strings.includes(a.user_Name));
                                        for (let sel of selected) {
                                            yield delay(delay_time);
                                            project.action_edit_relations([
                                                { change: 'add', sides: [{ class_id, prop_id, item_id: item.system_id }, Object.assign(Object.assign({}, target_obj), { item_id: sel.system_id })] }
                                            ]);
                                            // relation_queue.push([{ class_id, prop_id, item_id: item.system_id },{ ...target_obj, item_id: sel.system_id }])
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // project.action_make_relations(relation_queue);
            classes = project.retrieve_all_classes({
                all_items: { page_size: null }
            });
            console.log('\nrecipes item 1:', classes[0].items.loaded[0]);
            log_step('creating workspace with ingredient class');
            const workspace_id = project.action_config_window({ type: 'workspace', open: 1 });
            if (classes.length > 0 && workspace_id) {
                project.action_create_workspace_block({
                    workspace_id,
                    type: 'class',
                    thing_id: classes[0].id,
                    block_metadata: {}
                });
                project.action_create_workspace_block({
                    workspace_id,
                    type: 'class',
                    thing_id: classes[1].id,
                    block_metadata: {}
                });
                const workspace_contents = project.retrieve_workspace_contents(workspace_id);
                console.log('workspace_contents', (_g = workspace_contents.classes[0]) === null || _g === void 0 ? void 0 : _g.properties[1]);
            }
            return project;
        }
        return null;
    });
}
function grocery_queries() {
    return __awaiter(this, void 0, void 0, function* () {
        const project = yield create_groceries_project(true, 0);
        // test_full_return();
        // test_slim_return();
        // test_removing_relation();
        // test_item_range();
        test_max_condition();
        function test_full_return() {
            if (!project)
                return;
            const full_return = project.retrieve_class_items({ class_id: 1 });
            console.log('full_return', full_return);
        }
        function test_slim_return() {
            if (!project)
                return;
            const slim_return = project.retrieve_class_items({ class_id: 1, pagination: { property_range: 'slim' } });
            console.log('slim_return', slim_return);
        }
        function test_max_condition() {
            if (!project)
                return;
            const items = project.retrieve_class_items({
                class_id: 2,
                pagination: {
                    property_range: 'slim',
                    conditions: [
                        { name: 'under_property_max', property_id: 5 }
                    ]
                }
            });
            console.log('items', items);
        }
        function test_item_range() {
            if (!project)
                return;
            const items_in_range = project.retrieve_class_items({ class_id: 1, pagination: {
                    property_range: [3],
                    item_range: [20, 17, 15]
                } });
            console.log('items_in_range', items_in_range);
        }
        function test_removing_relation() {
            var _a, _b;
            if (!project)
                return;
            const reg_return = project.retrieve_class_items({ class_id: 1 });
            console.log('zucchini-tomato pasta ingredients', (_a = reg_return.loaded[0]) === null || _a === void 0 ? void 0 : _a.user_Ingredients);
            project.action_edit_relations([{
                    change: 'remove',
                    sides: [
                        { class_id: 1, item_id: 1, prop_id: 2 },
                        { class_id: 2, item_id: 27, prop_id: 3 }
                    ]
                }]);
            const refetch = project.retrieve_class_items({ class_id: 1 });
            console.log('zucchini-tomato pasta ingredients after removing garlic', (_b = refetch.loaded[0]) === null || _b === void 0 ? void 0 : _b.user_Ingredients);
        }
    });
}
function in_memory_tests() {
    const project = new Project(":memory:");
    log_step("setting up book-author-script schema");
    project.action_edit_class_schema({
        class_edits: [
            { type: "create", class_name: "author" },
            { type: "create", class_name: "book" },
            { type: "create", class_name: "script" },
        ],
        property_edits: [
            {
                type: "create",
                class_name: "author",
                prop_name: "age",
                config: { type: "data", data_type: "number", max_values: 1 },
            },
            {
                type: "create",
                class_name: "author",
                prop_name: "works",
                config: { type: "relation", max_values: null },
            },
            {
                type: "create",
                class_name: "author",
                prop_name: "books read",
                config: { type: "relation", max_values: null },
            },
            {
                type: "create",
                class_name: "book",
                prop_name: "author",
                config: { type: "relation", max_values: 1 },
            },
        ],
        relationship_edits: [
            {
                type: "create",
                sides: [
                    { class_name: "author", prop_name: "works" },
                    { class_name: "book", prop_name: "author" },
                ],
            },
            {
                type: "create",
                sides: [
                    { class_name: "author", prop_name: "works" },
                    { class_name: "script" },
                ],
            },
            {
                type: "create",
                sides: [
                    { class_name: "author", prop_name: "books read" },
                    { class_name: "book" },
                ],
            },
        ],
    });
    console.log(project.junction_cache.map((a) => a.sides));
    const slim_return = project.retrieve_class_items({ class_id: 1, pagination: { property_range: 'slim' } });
    console.log('zero items:', slim_return);
    log_step("adding items to classes");
    project.action_add_row(1);
    project.action_add_row(2);
    project.action_add_row(2);
    project.action_add_row(3);
    log_step("making connections between items in classes");
    project.action_edit_relations([
        {
            change: 'add',
            sides: [
                { class_id: 1, prop_id: 3, item_id: 1 },
                { class_id: 2, prop_id: 2, item_id: 2 }
            ]
        },
        {
            change: 'add',
            sides: [
                { class_id: 1, prop_id: 3, item_id: 1 },
                { class_id: 2, prop_id: 2, item_id: 3 }
            ]
        },
        {
            change: 'add',
            sides: [
                { class_id: 1, prop_id: 3, item_id: 1 },
                { class_id: 3, item_id: 4 }
            ]
        },
        {
            change: 'add',
            sides: [
                { class_id: 1, prop_id: 4, item_id: 1 },
                { class_id: 2, item_id: 2 }
            ]
        }
    ]);
    project.refresh_caches(["classlist", "items", "junctions"]);
    log_step("deleting author property in books");
    project.action_edit_class_schema({
        property_edits: [
            {
                type: "delete",
                class_id: 2,
                prop_id: 2,
            },
            {
                type: "create",
                class_id: 2,
                prop_name: "author2",
                config: {
                    type: "relation",
                    max_values: 1,
                },
            },
        ],
        relationship_edits: [
            {
                type: "create",
                sides: [
                    { class_id: 1, prop_id: 3 },
                    { class_id: 2, prop_name: "author2" }
                ],
            },
        ],
    });
    console.log(readable_junctionlist(project.junction_cache, project.class_cache));
}
function log_step(step_text, level = 2) {
    if (level == 1) {
        console.log("\n\n========================================================");
    }
    else {
        console.log("\n--------------------------------------------------------");
    }
    console.log(`SANDBOX: ${step_text}`);
}
function test_relation_matching() {
    const test1_old = [
        { class_id: 1, prop_id: 100 },
        { class_id: 2, prop_id: 200 },
    ];
    const test1_new = [
        { class_id: 1, prop_id: 100 },
        { class_id: 2, prop_id: 300 },
    ];
    const test2_old = [
        { class_id: 1, prop_id: 100 },
        { class_id: 2, prop_id: 200 },
    ];
    const test2_new = [
        { class_id: 1, prop_id: 300 },
        { class_id: 2, prop_id: 400 },
    ];
    // Case 3: Non-matching classes
    const test3_old = [
        { class_id: 1, prop_id: 100 },
        { class_id: 2, prop_id: 200 },
    ];
    const test3_new = [
        { class_id: 3, prop_id: 100 },
        { class_id: 4, prop_id: 200 },
    ];
    const test4a_old = [
        { class_id: 1, prop_id: 100 },
        { class_id: 1, prop_id: 200 },
    ];
    const test4a_new = [
        { class_id: 1, prop_id: 100 },
        { class_id: 1, prop_id: 300 },
    ];
    // Case 4b: Same class on both sides with no matching properties
    const test4b_old = [
        { class_id: 1, prop_id: 100 },
        { class_id: 1, prop_id: 200 },
    ];
    const test4b_new = [
        { class_id: 1, prop_id: 300 },
        { class_id: 1, prop_id: 400 },
    ];
    // Case 5: Reversed order matching
    const test5_old = [
        { class_id: 1, prop_id: 100 },
        { class_id: 2, prop_id: 200 },
    ];
    const test5_new = [
        { class_id: 2, prop_id: 200 },
        { class_id: 1, prop_id: 300 },
    ];
    // Case 6: Undefined property IDs
    const test6_old = [
        { class_id: 1 },
        { class_id: 2, prop_id: 200 },
    ];
    const test6_new = [
        { class_id: 1, prop_id: 100 },
        { class_id: 2 },
    ];
    // Case 7: Undefined property IDs on same side
    const test7_old = [
        { class_id: 1 },
        { class_id: 2, prop_id: 200 },
    ];
    const test7_new = [
        { class_id: 1 },
        { class_id: 2, prop_id: 100 },
    ];
    console.log("same class, at least one prop (expect true)", partial_relation_match(test1_new, test1_old));
    console.log("same class, no props  (expect false)", partial_relation_match(test2_old, test2_new));
    console.log("different classes (expect false)", partial_relation_match(test3_old, test3_new));
    console.log("only one class, matching prop (expect true)", partial_relation_match(test4a_new, test4a_old));
    console.log("only one class, no props (expect false)", partial_relation_match(test4b_old, test4b_new));
    console.log("reversed class order, prop matching (expect true)", partial_relation_match(test5_new, test5_old));
    console.log("undefined prop (expect false)", partial_relation_match(test6_old, test6_new));
    console.log("undefined prop 2 (expect false)", partial_relation_match(test7_old, test7_new));
}
//# sourceMappingURL=sandbox.js.map