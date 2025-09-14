import { JunctionSides, RelationshipSide, MaxValues, RelationshipSideBase, RelationEdit, RelationEditValidSides, ClassData, JunctionList, DataType } from "./types.js";
export declare function defined<T>(v: T): v is NonNullable<T>;
export declare const text_data_types: string[];
export declare const integer_data_types: string[];
export declare const real_data_types: string[];
export declare function partial_relation_match(old_relation: JunctionSides, new_relation: JunctionSides): boolean;
export declare function side_match(x: RelationshipSide, y: RelationshipSide): boolean;
export declare function full_relation_match(a: JunctionSides, b: JunctionSides): boolean;
export declare function valid_sides(sides: [RelationshipSideBase, RelationshipSideBase]): sides is [RelationshipSide, RelationshipSide];
export declare function two_way(sides: JunctionSides): boolean;
export declare function edit_has_valid_sides(edit: RelationEdit): edit is RelationEditValidSides;
export declare function can_have_multiple_values(max_values: MaxValues): boolean;
export declare function junction_col_name(class_id: number, prop_id: number | undefined | null): string;
export declare function readable_side(side: RelationshipSide, classlist: ClassData[]): string;
export declare function readable_edit(edit: RelationEditValidSides, classlist: ClassData[]): string | undefined;
export declare function readable_junctionlist(relationships: JunctionList, classlist: ClassData[]): string[];
export declare function validate_data_value(input: any, data_type: DataType, max_values: MaxValues): {
    valid: true;
    output: string | number;
} | {
    valid: false;
    message: string;
};
