import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import type { SQLTableType, SQLClassListRow, SQLJunctonListRow, JunctionSides, JunctionList, ClassList, Property, DataType, SQLApplicationWindow, ApplicationWindow, WorkspaceBlock, ClassData, ClassEdit, RelationEdit, PropertyEdit, MaxValues, PropertyType, RelationProperty, DataProperty, RelationEditValidSides, ItemPagination, PaginatedItems, ItemRelationSideInput } from './types.js';
export default class Project {
    db: DatabaseType;
    run: {
        [key: string]: Statement;
        get_all_classes: Statement<[], SQLClassListRow>;
        get_junctionlist: Statement<[], SQLJunctonListRow>;
        get_junctions_matching_property: Statement<{
            class_id: number;
            prop_id: number | null;
        }, {
            id: number;
            sides: string;
        }>;
        get_windows: Statement<[], SQLApplicationWindow>;
        get_class_id: Statement<[string], {
            id: number;
        }>;
    };
    class_cache: ClassList;
    junction_cache: JunctionList;
    constructor(source: string);
    get_latest_table_row_id(table_name: string): number | null;
    init(): void;
    refresh_caches(caches: ('classlist' | 'items' | 'junctions')[]): void;
    create_table(type: SQLTableType, name: string | number, columns: string[]): void;
    action_create_class(name: string): number;
    add_data_property({ class_id, name, data_type, max_values, create_column }: {
        class_id: number;
        name: string;
        data_type: DataType;
        max_values: MaxValues;
        create_column?: boolean;
    }): void;
    add_relation_property(class_id: number, name: string, max_values: MaxValues): number;
    delete_property(class_id: number, prop_id: number): void;
    get_junctions(): {
        sides: JunctionSides;
        id: number;
        metadata: string;
    }[];
    action_edit_class_schema({ class_edits, property_edits, relationship_edits }: {
        class_edits?: ClassEdit[];
        property_edits?: PropertyEdit[];
        relationship_edits?: RelationEdit[];
    }): void;
    consolidate_relationship_edits(relationship_edits: RelationEdit[]): RelationEditValidSides[];
    action_delete_class(class_id: number): void;
    create_junction_table(sides: JunctionSides): number;
    transfer_connections(source: {
        sides: JunctionSides;
        id: number;
    }, target: {
        sides: JunctionSides;
        id: number;
    }): void;
    delete_junction_table(id: number): void;
    check_conditions({ class_id, prop_id, property, class_data }: {
        class_id?: number;
        prop_id?: number;
        property?: Property;
        class_data: ClassData;
    }): void;
    action_save(): void;
    create_item_in_root({ type, value }: {
        type: string | null;
        value?: string;
    }): number;
    delete_item_from_root(id: number): void;
    action_set_root_item_value(id: number, value: string): void;
    lookup_class(class_id: number): ClassData;
    /**
     * Creates a new item and adds it to the class you indicate
     * @param class_id - class you want to add new item to
     * @param property_values - any properties you want to fill in as you create this item (data props only for now)
     * @returns - id of new item
     */
    action_add_row(class_id: number, property_values?: {
        property_id: number;
        value: any;
    }[]): number;
    get_next_order(table_name: string): number;
    /**
     * Sets 1 or more data property values for a given class item.
     * @param class_id - class of item
     * @param item_id - id of item
     * @param changes - array of data properties to be set
     */
    action_edit_item_data(class_id: number, item_id: number, changes: {
        property_id: number;
        value: any;
    }[]): void;
    /**
     * Adds/removes relations between items/item properties.
     * Can create new items in a class if a label is specified instead of an item id.
     * Returns a record of which items and properties were edited/created
     * @param relations - list of pairs of items for which relations should be added or removed between specified properties
     */
    action_edit_relations(relations: {
        change: 'add' | 'remove';
        sides: [input_1: ItemRelationSideInput, input_2: ItemRelationSideInput];
    }[]): Partial<Record<number, {
        modified_items: number[];
        modified_properties: number[];
        created_items: number[];
    }>>;
    retrieve_class_items({ class_id, class_name, class_data, pagination }: {
        class_id: number;
        class_name?: string;
        class_data?: ClassData;
        pagination?: ItemPagination;
    }): PaginatedItems;
    retrieve_all_classes(include?: {
        all_items?: ItemPagination;
        items_by_class?: {
            class_id: number;
            pagination: ItemPagination;
        }[];
    }): ClassData[];
    parse_sql_prop(class_id: number, sql_prop: {
        id: number;
        type: PropertyType;
        data_type: 'string' | null;
        max_values: MaxValues;
        name: string;
        metadata: string;
    }): (DataProperty | RelationProperty);
    retrieve_windows(): ApplicationWindow[];
    retrieve_workspace_contents(id: number): {
        blocks: WorkspaceBlock[];
        items: unknown[];
        classes: ClassData[];
    };
    action_config_window({ type, open, metadata, id }: {
        type: ApplicationWindow["type"];
        open: ApplicationWindow["open"];
        metadata?: ApplicationWindow["metadata"];
        id?: number;
    }): number | undefined;
    create_workspace(open: ApplicationWindow["open"], metadata: ApplicationWindow["metadata"]): number;
    action_create_workspace_block({ workspace_id, type, block_metadata, thing_id }: {
        workspace_id: ApplicationWindow["id"];
        type: WorkspaceBlock["type"];
        block_metadata: WorkspaceBlock["metadata"];
        thing_id: WorkspaceBlock["thing_id"];
    }): number;
    action_remove_workspace_block({ workspace_id, block_id }: {
        workspace_id: number;
        block_id: number;
    }): void;
    action_create_and_add_to_workspace({ workspace_id, type, block_metadata, thing_data }: {
        workspace_id: number;
        type: WorkspaceBlock["type"];
        block_metadata: WorkspaceBlock["metadata"];
        thing_data: any;
    }): {
        thing_id: number;
        block_id: number;
    };
    action_remove_from_workspace_and_delete(workspace_id: number, block_id: number, type: WorkspaceBlock["type"], thing_id: number): void;
}
