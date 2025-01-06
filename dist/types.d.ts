export type SQLTableType = 'class' | 'system' | 'junction';
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
export type JunctionSide = {
    class_id: number;
    prop_id?: number;
};
export type JunctionSides = [JunctionSide, JunctionSide];
export type ClassList = {
    id: number;
    name: string;
    metadata: {};
}[];
export type JunctionList = {
    id: number;
    sides: JunctionSides;
    metadata: {};
}[];
