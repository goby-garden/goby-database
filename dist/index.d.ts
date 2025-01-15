import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import type { SQLTableType, SQLClassListRow, SQLJunctonListRow, JunctionSides, JunctionList, ClassList, ClassMetadata, Property, DataType, ItemRelationSide, SQLApplicationWindow, ApplicationWindow, WorkspaceBlock, ClassData, ClassRow, ClassEdit, RelationEdit, PropertyEdit, MaxValues } from './types.js';
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
    refresh_class_cache(): void;
    refresh_junction_cache(): void;
    create_table(type: SQLTableType, name: string | number, columns: string[]): void;
    action_create_class(name: string): number;
    action_add_data_property({ class_id, name, data_type, max_values }: {
        class_id: number;
        name: string;
        data_type: DataType;
        max_values: MaxValues;
    }): void;
    action_add_relation_property(class_id: number, name: string, max_values: MaxValues): number;
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
    action_delete_class(class_id: number): void;
    create_junction_table(sides: JunctionSides): number;
    transfer_connections(source: {
        side_a: string;
        side_b: string;
        id: number;
    }, target: {
        side_a: string;
        side_b: string;
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
    action_create_item_in_root({ type, value }: {
        type: string | null;
        value?: string;
    }): number;
    action_delete_item_from_root(id: number): void;
    action_set_root_item_value(id: number, value: string): void;
    action_add_row(class_id: number): number;
    action_make_relation(input_1: ItemRelationSide, input_2: ItemRelationSide): void;
    retrieve_class({ class_id, class_name, class_meta }: {
        class_id: number;
        class_name?: string;
        class_meta?: ClassMetadata;
    }): {
        id: number;
        items: ClassRow[];
        metadata: ClassMetadata;
        name: string;
    };
    retrieve_all_classes(): {
        id: number;
        items: ClassRow[];
        metadata: ClassMetadata;
        name: string;
    }[];
    retrieve_windows(): SQLApplicationWindow[];
    retrieve_workspace_contents(id: number): {
        blocks_parsed: WorkspaceBlock[];
        items: unknown[];
    };
    action_config_window({ type, open, metadata, id }: {
        type: ApplicationWindow["type"];
        open: ApplicationWindow["open"];
        metadata: ApplicationWindow["metadata"];
        id: number;
    }): number | undefined;
    create_workspace(open: ApplicationWindow["open"], metadata: ApplicationWindow["metadata"]): number;
    action_create_workspace_block({ workspace_id, thing_type, block_metadata, thing_id }: {
        workspace_id: ApplicationWindow["id"];
        thing_type: WorkspaceBlock["thing_type"];
        block_metadata: WorkspaceBlock["metadata"];
        thing_id: WorkspaceBlock["thing_id"];
    }): number;
    action_remove_workspace_block({ workspace_id, block_id }: {
        workspace_id: number;
        block_id: number;
    }): void;
    action_create_and_add_to_workspace({ workspace_id, thing_type, block_metadata, thing_data }: {
        workspace_id: number;
        thing_type: WorkspaceBlock["thing_type"];
        block_metadata: WorkspaceBlock["metadata"];
        thing_data: any;
    }): {
        thing_id: number;
        block_id: number;
    };
    action_remove_from_workspace_and_delete(workspace_id: number, block_id: number, thing_type: WorkspaceBlock["thing_type"], thing_id: number): void;
}
