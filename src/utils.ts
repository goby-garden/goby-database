import { JunctionSides, RelationshipSide,MaxValues,RelationshipSideBase, RelationEdit, RelationEditValidSides,ClassData,JunctionList, DataType } from "./types.js";


export function defined<T>(v:T):v is NonNullable<T>{
    return v!==undefined && v!==null;
}

export const text_data_types=['string','resource'];

export const integer_data_types=['boolean'];

export const real_data_types=['number'];


// given the type above,
// check if two relations share class ids on both sides
// and share a property id on at least one side
// note: it’s possible for both sides of a relation to have the same class id

export function partial_relation_match(old_relation:JunctionSides,new_relation:JunctionSides):boolean{

    // find class id matches in old for each side of new relation
    let new_side_matches_in_old=[
        [0,1].filter((i)=> old_relation[i].class_id==new_relation[0].class_id),
        [0,1].filter((i)=> old_relation[i].class_id==new_relation[1].class_id)
    ];

    // for each match in the first side of the new relation
    for(let match_index of new_side_matches_in_old[0]){

        // converts 0 to 1 and 1 to 0, to get opposite side
        let opposite_index=Math.abs(match_index-1);

        // if this check passes, the relations share class IDs on both sides
        if(new_side_matches_in_old[1].includes(opposite_index)){
            // class match A
            let match_a_new=new_relation[0];
            let match_a_old=old_relation[match_index];

            // class match B
            let match_b_new=new_relation[1];
            let match_b_old=old_relation[opposite_index];;
            
            // should return true if the properties match on at least one side
            if(properties_exist_and_match(match_a_new,match_a_old) || properties_exist_and_match(match_b_new,match_b_old)){
                return true;
            }
        }

    }     

    // if no matches found, return false found, 
    return false;

 }

 function properties_exist_and_match(a:RelationshipSide,b:RelationshipSide){
    return defined(a.prop_id) && defined(b.prop_id) && a.prop_id == b.prop_id;
}

function properties_match(a:RelationshipSide,b:RelationshipSide){
    if(!defined(a.prop_id) && !defined(b.prop_id)) return true;
    else return a.prop_id == b.prop_id;

    // return defined(a.prop_id) && defined(b.prop_id) && a.prop_id == b.prop_id;
}

 export function side_match(x:RelationshipSide,y:RelationshipSide){
    return x.class_id==y.class_id&&properties_match(x,y);
 };

 export function full_relation_match(a:JunctionSides,b:JunctionSides):boolean{
    return (side_match(a[0],b[0])&&side_match(a[1],b[1])) ||
           (side_match(a[0],b[1])&&side_match(a[1],b[0]));
 }

export function valid_sides(sides:[RelationshipSideBase,RelationshipSideBase]):sides is [RelationshipSide,RelationshipSide]{
    return defined(sides[0].class_id) && defined(sides[1].class_id)
}

export function two_way(sides:JunctionSides){
    return defined(sides[0].prop_id) && defined(sides[1].prop_id);
}

export function edit_has_valid_sides(edit:RelationEdit):edit is RelationEditValidSides{
    switch(edit.type){
        case 'create':
            if(valid_sides(edit.sides)) return true;
            break;
        case 'transfer':
            if(valid_sides(edit.sides)&&valid_sides(edit.new_sides)) return true;
            break;
        case 'delete':{
            return true;
        }
    }
    return false;
}



 export function can_have_multiple_values(max_values:MaxValues){
    return max_values==null || max_values>1;
 }

export function junction_col_name(class_id:number,prop_id:number | undefined | null):string{
    let prop_str=defined(prop_id)?`_prop_${prop_id}`:``
    return `class_${class_id}${prop_str}`;
}


export function readable_side(side:RelationshipSide,classlist:ClassData[]){
    let matching_class=classlist.find(c=>c.id==side.class_id);
    let matching_prop=side.prop_id?(matching_class?.properties?.find(p=>p.id==side.prop_id)?.name || ''):'';
    
    matching_prop=matching_prop?`.[${matching_prop}]`:'';


    return `${matching_class?.name || ''}${matching_prop}`;
}

function readable_sides(sides:JunctionSides,classlist:ClassData[]){
    return `${readable_side(sides[0],classlist)} <-> ${readable_side(sides[1],classlist)}`
}


export function readable_edit(edit:RelationEditValidSides,classlist:ClassData[]){
    if(edit.type=='delete') return `deletion of relation ${edit.id}`;
    else if (edit.type=='transfer') return `transfer of (${readable_sides(edit.sides,classlist)}) to (${readable_sides(edit.new_sides,classlist)})`;
    else if (edit.type=='create') return `creation of (${readable_sides(edit.sides,classlist)})`;
}


export function readable_junctionlist(relationships:JunctionList,classlist:ClassData[]){

    return relationships.map((r)=>{
        return readable_sides(r.sides,classlist)
    })
}


export function validate_data_value(input:any,data_type:DataType,max_values:MaxValues):{valid:true,output:string | number} | {valid:false,message:string}{
    const multiple=max_values==null||max_values>1;
    const values=multiple?input:[input];
    if(!Array.isArray(values)){
        return {valid:false,message:'Expecting array, got single value'};
    }
    
    const validated_values=[];

    for(let value of values){
        if(real_data_types.includes(data_type) || integer_data_types.includes(data_type)){
            if(data_type=='boolean'){
                if(typeof value=='boolean' || [0,1].includes(value)){
                    validated_values.push(+value);
                }else{
                    return {valid:false,message:`Expecting boolean or binary integer, got "${value}" (${typeof value})`};
                }
            }else if(typeof value=='number'){
                validated_values.push(value);
            }else{
                return {valid:false,message:`Expecting number, got "${value}" (${typeof value})`};
            }
        }else if(text_data_types.includes(data_type)){
            // NOTE: could come back to validate resource as links/filepaths later, but leaving unopinionated for now
            if(typeof value=='string'){
                validated_values.push(value);
            }else{
                return {valid:false,message:`Expecting string, got "${value}" (${typeof value})`};
            }
        }
    }

    const output=multiple?JSON.stringify(validated_values):validated_values[0];

    return {
        valid:true,
        output
    }
}