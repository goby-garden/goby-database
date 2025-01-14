export function defined(v) {
    return v !== undefined && v !== null;
}
// given the type above,
// check if two relations share class ids on both sides
// and share a property id on at least one side
// note: it’s possible for both sides of a relation to have the same class id
export function partial_relation_match(old_relation, new_relation) {
    // find class id matches in old for each side of new relation
    let new_side_matches_in_old = [
        [0, 1].filter((i) => old_relation[i].class_id == new_relation[0].class_id),
        [0, 1].filter((i) => old_relation[i].class_id == new_relation[1].class_id)
    ];
    // for each match in the first side of the new relation
    for (let match_index of new_side_matches_in_old[0]) {
        // converts 0 to 1 and 1 to 0, to get opposite side
        let opposite_index = Math.abs(match_index - 1);
        // if this check passes, the relations share class IDs on both sides
        if (new_side_matches_in_old[1].includes(opposite_index)) {
            // class match A
            let match_a_new = new_relation[0];
            let match_a_old = old_relation[match_index];
            // class match B
            let match_b_new = new_relation[1];
            let match_b_old = old_relation[opposite_index];
            ;
            // should return true if the properties match on at least one side
            if (properties_match(match_a_new, match_a_old) || properties_match(match_b_new, match_b_old)) {
                return true;
            }
        }
    }
    // if no matches found, return false found, 
    return false;
    function properties_match(a, b) {
        return defined(a.prop_id) && defined(b.prop_id) && a.prop_id == b.prop_id;
    }
}
//# sourceMappingURL=utils.js.map