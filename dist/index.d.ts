import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import type { SQLTableType, SQLClassListRow, SQLJunctonListRow, JunctionList, ClassList } from './types.js';
export default class Project {
    db: DatabaseType;
    run: {
        [key: string]: Statement;
        get_all_classes: Statement<[], SQLClassListRow>;
        get_junctionlist: Statement<[], SQLJunctonListRow>;
    };
    class_cache: ClassList;
    junction_cache: JunctionList;
    constructor(source: string);
    get_latest_table_row_id(table_name: string): number | null;
    init(): void;
    refresh_class_cache(): void;
    refresh_junction_cache(): void;
    create_table(type: SQLTableType, name: string, columns: string[]): void;
    action_create_class(name: string, meta: any): number | undefined;
    action_add_data_property(class_id: any, name: any, conditions: any, datatype: any, style: any): void;
    action_add_relation_property(class_id: any, name: any, conditions: any, style: any): number;
    delete_property(class_id: any, prop_id: any): void;
    get_junctions(): SQLJunctonListRow[];
    action_edit_class_schema(edits: any): void;
    action_update_relations(junction_list: any): void;
    create_junction_table(sides: any): any;
    transfer_connections(source: any, target: any): void;
    delete_junction_table(id: any): void;
    check_conditions(class_id: any, prop_id: any, targets: any, conditions: any): void;
    action_save(): void;
    action_create_item_in_root({ type, value }: {
        type?: null | undefined;
        value?: string | undefined;
    }): any;
    action_delete_item_from_root(id: any): void;
    action_set_root_item_value(id: any, value: any): void;
    action_add_row(class_id: any, class_name: any): any;
    action_make_relation(input_1: any, input_2: any): void;
    retrieve_class(class_id: any, class_name: any, class_meta: any): {
        items: unknown[];
        metadata: any;
        name: any;
    };
    retrieve_all_classes(): {
        items: unknown[];
        metadata: any;
        name: any;
    }[];
    retrieve_windows(): unknown[];
    retrieve_workspace_contents(id: any): {
        blocks: unknown[];
        items: unknown[];
    };
    action_config_window(type: any, open: any, meta: {
        pos: null[];
        size: number[];
    } | undefined, id: any): number | null | undefined;
    create_workspace(open: any, meta: any): number | null;
    action_create_workspace_block({ workspace_id, type, properties, concept_id }: {
        workspace_id: any;
        type: any;
        properties: any;
        concept_id: any;
    }): any;
    action_remove_workspace_block({ workspace_id, block_id }: {
        workspace_id: any;
        block_id: any;
    }): void;
    action_create_and_add_to_workspace(workspace_id: any, blocktype: any, block_properties: any, concept_data: any): {
        concept_id: any;
        block_id: any;
    };
    action_remove_from_workspace_and_delete(workspace_id: any, block_id: any, blocktype: any, concept_id: any): void;
}
