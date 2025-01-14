export type SQLTableType = 'class' | 'system' | 'junction' | 'workspace';
export type SQLClassListRow = {
    id: number;
    name: string;
    metadata: string;
};
export type SQLJunctonListRow = {
    id: number;
    sides: string;
    metadata: string;
};
export type RelationTargetBase = {
    class_id?: number;
    prop_id?: number;
    class_name?: string;
    prop_name?: string;
};
export type RelationTarget = RelationTargetBase & {
    class_id: number;
};
export type ItemRelationSide = RelationTarget & {
    item_id: number;
};
type RelationCreate = {
    type: 'create';
    sides: [
        RelationTargetBase,
        RelationTargetBase
    ];
};
type RelationDelete = {
    type: 'delete';
    id: number;
};
type RelationTransfer = {
    type: 'transfer';
    id: number;
    sides: [
        RelationTarget,
        RelationTarget
    ];
    new_sides: [
        RelationTargetBase,
        RelationTargetBase
    ];
};
export type RelationEdit = RelationCreate | RelationDelete | RelationTransfer;
type PropertyCreate = {
    type: 'create';
    prop_name: string;
    class_id?: number;
    class_name?: string;
    config: PropertyDefinition;
};
type PropertyDelete = {
    type: 'delete';
    class_id: number;
    prop_id: number;
};
type PropertyModify = {
    type: 'modify';
    prop_id: number;
    class_id: number;
    config: PropertyDefinition;
};
export type PropertyEdit = PropertyCreate | PropertyDelete | PropertyModify;
type ClassCreate = {
    type: 'create';
    class_name: string;
};
type ClassDelete = {
    type: 'delete';
    class_id: number;
};
type ClassModify = {
    type: 'modify_attribute';
    class_id: number;
    attribute: {
        name: string;
        value: any;
    };
};
export type ClassEdit = ClassCreate | ClassDelete | ClassModify;
export type ClassMetadata = {
    properties: Property[];
    used_prop_ids: number[];
    style: {
        color?: string;
    };
};
export type PropertyType = 'data' | 'relation';
export type BinaryBoolean = 0 | 1;
export type BaseProperty = {
    id: number;
    name: string;
    type: PropertyType;
    max_values: number;
};
export type RelationDefinition = {
    type: 'relation';
    relation_targets: RelationTarget[];
    data_type?: never;
};
export type RelationProperty = BaseProperty & RelationDefinition;
export type DataType = 'string' | 'resource' | 'number';
export type DataDefinition = {
    type: 'data';
    data_type: DataType;
    relation_targets?: never;
};
export type DataProperty = BaseProperty & DataDefinition;
export type Property = RelationProperty | DataProperty;
export type PropertyDefinition = {
    max_values: number;
} & ({
    type: 'relation';
} | DataDefinition);
export type ClassRow = {
    [key: string]: any;
};
export type ClassData = {
    id: number;
    name: string;
    metadata: ClassMetadata;
    items: ClassRow[];
};
export type ClassList = ClassData[];
export type JunctionSides = [RelationTarget, RelationTarget];
export type JunctionTable = {
    id: number;
    sides: JunctionSides;
    metadata: {};
};
export type JunctionList = JunctionTable[];
export type BaseCreateAction = {
    action: 'create';
    class_id?: number;
    prop_id?: number;
    class_name?: string;
};
export type CreatePropertyAction = BaseCreateAction & {
    prop_name: string;
} & PropertyDefinition;
export type CreateAction = BaseCreateAction | CreatePropertyAction;
export type DeleteAction = {
    action: 'delete';
} & ({
    subject: 'property';
    prop_id: number;
    class_id: number;
} | {
    subject: 'class';
    class_id: number;
    prop_id: never;
});
export type Action = CreateAction | DeleteAction;
export type SQLApplicationWindow = {
    id: number;
    type: string;
    open: BinaryBoolean;
    metadata: string;
};
export type ApplicationWindow = {
    id: number;
    type: string;
    open: BinaryBoolean;
    metadata: {};
};
export type ThingType = 'item' | 'class';
export type BaseWorkspaceBlock = {
    block_id: number;
    thing_type: ThingType;
    thing_id: number;
};
export type SQLWorkspaceBlockRow = BaseWorkspaceBlock & {
    metadata: string;
};
export type WorkspaceBlock = BaseWorkspaceBlock & {
    metadata: {};
};
export {};
