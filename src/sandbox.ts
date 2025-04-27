import { readable_junctionlist } from "./utils.js";
import Project from "./index.js";
import { tsvParse } from "d3-dsv";
import { readFileSync, existsSync } from "node:fs";
import { ClassData, DataType, ItemRelationSide, MaxValues, Property } from "./types.js";
import { defined } from "./utils.js";

const [, , arg] = process.argv;

if (arg) {
  log_step(`running ${arg} test...`, 1);
  switch (arg) {
    case "in-memory":
      in_memory_tests();
      break;
    case "groceries":
      create_groceries_project();
      break;
    case "default":
      console.log(`no such test "${arg}" exists`);
      break;
  }
} else {
  console.log("no test provided");
}

function create_groceries_project() {
  const write_to_db = true;
  const d = new Date();
  const d_string = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}_${d.getHours()}.${d.getMinutes()}`;
  console.log("d_string", d_string);

  const db_path = `test_data/db/groceries_${d_string}.db`;
  if (!existsSync(db_path) || !write_to_db) {
    const project = new Project(!write_to_db ? ":memory:" : db_path);
    const tables: {
      title: string;
      tsv?: string;
      tsv_parsed?: { [key: string]: any }[];
      class_data?: ClassData;
      properties: {
        name: string;
        type: "relation" | DataType;
        max_values: MaxValues;
      }[];
    }[] = [
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

    log_step('Creating class schema')
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
              config:
                prop.type == "relation"
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
    const classes = project.class_cache;

    log_step('Populating classes from table row data')
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
          const item_id = project.action_add_row(class_id);

          const changes = data_cols.map(({ name, property_id }) => ({
            property_id,
            value:
              row[name] == "FALSE"
                ? false
                : row[name] == "TRUE"
                ? true
                : row[name],
          }));

          project.action_set_property_values(class_id, item_id, changes);
        }
      }
    }


    log_step("Looping through tables to make relations...");
    
    const ingredients = project.class_cache.find(
      (cls) => cls.name == "Ingredients"
    );
    const enjoyers = project.class_cache.find((cls) => cls.name == "Enjoyers");
    const meals = project.class_cache.find((cls) => cls.name == "Meal types");
    const ingredient_type = project.class_cache.find(
      (cls) => cls.name == "Ingredient categories"
    );

    const targets: {
      [key: string]: { class?: ClassData; prop?: Property };
    } = {
      Ingredients: {
        class: ingredients,
        prop: ingredients?.properties?.find((a) => a.name == "Used in"),
      },
      "Nice-to-have": { class: ingredients },
      Enjoyers: { class: enjoyers },
      Meal: { class: meals },
      Category: { class: ingredient_type },
    };

    const relation_queue:[input_1:ItemRelationSide,input_2:ItemRelationSide][]=[];

    for (let { properties, tsv_parsed, class_data } of tables) {
      
      if (tsv_parsed && defined(class_data)) {
        const class_id = class_data.id;
        for (let prop of properties.filter((p) => p.type == "relation")) {
          

          const prop_id = class_data.properties.find(
            (a) => a.name == prop.name
          )?.id;
          const target = targets[prop.name];
          
          if (target && target.class && defined(prop_id)) {
            console.log('\nprop:',`${class_data.name} / ${prop.name}`);
            console.log('target:',`${target.class.name} ${target.prop?.name ? '/ '+target.prop?.name : ''}`)

            const target_obj = {
              class_id: target.class.id,
              ...(target.prop ? { prop_id: target.prop.id } : {}),
            };

            for (let row of tsv_parsed) {
              const item = class_data.items.find((i) => i.user_Name == row.Name);
              if (item) {
                const selected_strings =
                  row[prop.name]?.split(",")?.map((a: string) => a.trim()) ||
                  [];
                const selected = target.class.items.filter((a) =>
                  selected_strings.includes(a.user_Name)
                );
                for (let sel of selected) {
                    relation_queue.push([{ class_id, prop_id, item_id: item.system_id },{ ...target_obj, item_id: sel.system_id }])
                }
              }
            }
          }
        }
      }
    }

    project.action_make_relations(relation_queue);

    console.log(project.class_cache[0].items)

    log_step('creating workspace with ingredient class')
    const workspace_id=project.action_config_window({type:'workspace',open:1});
    if(project.class_cache.length>0&&workspace_id){
      project.action_create_workspace_block({
        workspace_id,
        thing_type:'class',
        thing_id:project.class_cache[0].id,
        block_metadata:{}
      })
    }
  }
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

  log_step("adding items to classes");
  project.action_add_row(1);
  project.action_add_row(2);
  project.action_add_row(2);
  project.action_add_row(3);

  log_step("making connections between items in classes");
  project.action_make_relations(
    [
        [
            {
            class_id: 1,
            prop_id: 3,
            item_id: 1,
            },
            {
            class_id: 2,
            prop_id: 2,
            item_id: 2,
            }
        ],
        [{
            class_id: 1,
            prop_id: 3,
            item_id: 1,
          },
          {
            class_id: 2,
            prop_id: 2,
            item_id: 3,
          }],
          [{
            class_id: 1,
            prop_id: 3,
            item_id: 1,
          },
          {
            class_id: 3,
            item_id: 4,
          }],
          [{
            class_id: 1,
            prop_id: 4,
            item_id: 1,
          },
          {
            class_id: 2,
            item_id: 2,
          }]
    ]
  );

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
          { class_id: 2, prop_name: "author2" },
        ],
      },
    ],
  });

  console.log(
    readable_junctionlist(project.junction_cache, project.class_cache)
  );
}

function log_step(step_text: string, level: number = 2) {
  if (level == 1) {
    console.log("\n\n========================================================");
  } else {
    console.log("\n--------------------------------------------------------");
  }

  console.log(`SANDBOX: ${step_text}`);
}
