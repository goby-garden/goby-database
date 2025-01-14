import { JunctionSides } from "./types";
export declare function defined<T>(v: T): v is NonNullable<T>;
export declare function partial_relation_match(old_relation: JunctionSides, new_relation: JunctionSides): boolean;
