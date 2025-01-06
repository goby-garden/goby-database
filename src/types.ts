export type SQLTableType = 'class' | 'system' | 'junction' | 'workspace';

export type SQLClassListRow = {
    id: number;
    name: string;
    metadata: string; // JSON string
  };

export type SQLJunctonListRow = {
    id: number;
    sides: string; //JSON string
    metadata: string; // JSON string
  };

export type RelationTarget ={
    class_id:number;
    prop_id?:number;
    class_name?:string;
    prop_name?:string;
};


export type ItemRelationSide = RelationTarget & {
  item_id:number;
}


export type JunctionSides =[RelationTarget,RelationTarget];

export type ClassMetadata ={
  // NOTE: planning to move these outside of metadata into their own table in the future
  properties:Property[],
  used_prop_ids:number[],
  style:{
    color?:string
  }
}

export type PropertyType = 'data' | 'relation';

export type BinaryBoolean = 0 | 1;

export type BaseProperty={
  id:number,
  name:string,
  type:PropertyType,
  max_values:number
}


export type RelationDefinition = {
  type:'relation';
  relation_targets:RelationTarget[];
  data_type?:never;
}

export type RelationProperty = BaseProperty & RelationDefinition;

export type DataType = 'string' |'resource' | 'number';

export type DataDefinition = {
  type:'data';
  data_type:DataType;
  relation_targets?:never;
}

export type DataProperty = BaseProperty & DataDefinition;

export type Property = RelationProperty | DataProperty;

export type PropertyDefinition = {max_values:number} & (RelationDefinition | DataDefinition);


export type ClassRow={ [key: string]: any };

export type ClassData ={
  id:number;
  name:string;
  metadata:ClassMetadata;
  items:ClassRow[]
};

export type ClassList =ClassData[];

export type JunctionList ={
    id:number,
    sides:JunctionSides,
    metadata:{}
}[];

export type BaseCreateAction = { 
  action:'create';
  class_id?:number;
  prop_id?:number;
  class_name?:string;
};

export type CreatePropertyAction = BaseCreateAction & {prop_name:string} & PropertyDefinition;

export type CreateAction = BaseCreateAction | CreatePropertyAction;

export type DeleteAction = { action:'delete' } & ({
  subject:'property';
  prop_id:number;
  class_id:number;
} | {
  subject:'class';
  class_id:number;
  prop_id:never;
});

export type Action = CreateAction | DeleteAction;


export type SQLApplicationWindow ={
  id:number;
  type:string;
  open:BinaryBoolean;
  metadata:string; // JSON string
}
export type ApplicationWindow ={
  id:number;
  type:string;
  open:BinaryBoolean;
  metadata:{}; 
}

// maybe elaborate this in the future
export type ThingType = 'item' | 'class';

export type SQLWorkspaceBlockRow = {
  block_id:number;
  metadata:string;
  thing_type:ThingType;
  thing_id:number;
}

export type WorkspaceBlock ={
  block_id:number;
  metadata:{};
  thing_type:ThingType;
  thing_id:number;
}