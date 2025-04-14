import { JunctionSides } from "./types.js";
import { partial_relation_match } from "./utils.js";

testRelationMatching();

function testRelationMatching() {
  const test1_old: JunctionSides = [
    { class_id: 1, prop_id: 100 },
    { class_id: 2, prop_id: 200 },
  ];

  const test1_new: JunctionSides = [
    { class_id: 1, prop_id: 100 },
    { class_id: 2, prop_id: 300 },
  ];

  const test2_old: JunctionSides = [
    { class_id: 1, prop_id: 100 },
    { class_id: 2, prop_id: 200 },
  ];
  const test2_new: JunctionSides = [
    { class_id: 1, prop_id: 300 },
    { class_id: 2, prop_id: 400 },
  ];

  // Case 3: Non-matching classes
  const test3_old: JunctionSides = [
    { class_id: 1, prop_id: 100 },
    { class_id: 2, prop_id: 200 },
  ];
  const test3_new: JunctionSides = [
    { class_id: 3, prop_id: 100 },
    { class_id: 4, prop_id: 200 },
  ];

  const test4a_old: JunctionSides = [
    { class_id: 1, prop_id: 100 },
    { class_id: 1, prop_id: 200 },
  ];
  const test4a_new: JunctionSides = [
    { class_id: 1, prop_id: 100 },
    { class_id: 1, prop_id: 300 },
  ];

  // Case 4b: Same class on both sides with no matching properties
  const test4b_old: JunctionSides = [
    { class_id: 1, prop_id: 100 },
    { class_id: 1, prop_id: 200 },
  ];
  const test4b_new: JunctionSides = [
    { class_id: 1, prop_id: 300 },
    { class_id: 1, prop_id: 400 },
  ];

  // Case 5: Reversed order matching
  const test5_old: JunctionSides = [
    { class_id: 1, prop_id: 100 },
    { class_id: 2, prop_id: 200 },
  ];
  const test5_new: JunctionSides = [
    { class_id: 2, prop_id: 200 },
    { class_id: 1, prop_id: 300 },
  ];

  // Case 6: Undefined property IDs
  const test6_old: JunctionSides = [
    { class_id: 1 },
    { class_id: 2, prop_id: 200 },
  ];
  const test6_new: JunctionSides = [
    { class_id: 1, prop_id: 100 },
    { class_id: 2 },
  ];

  // Case 7: Undefined property IDs on same side
  const test7_old: JunctionSides = [
    { class_id: 1 },
    { class_id: 2, prop_id: 200 },
  ];
  const test7_new: JunctionSides = [
    { class_id: 1 },
    { class_id: 2, prop_id: 100 },
  ];

  console.log(
    "same class, at least one prop (expect true)",
    partial_relation_match(test1_new, test1_old)
  );
  console.log(
    "same class, no props  (expect false)",
    partial_relation_match(test2_old, test2_new)
  );
  console.log(
    "different classes (expect false)",
    partial_relation_match(test3_old, test3_new)
  );
  console.log(
    "only one class, matching prop (expect true)",
    partial_relation_match(test4a_new, test4a_old)
  );
  console.log(
    "only one class, no props (expect false)",
    partial_relation_match(test4b_old, test4b_new)
  );
  console.log(
    "reversed class order, prop matching (expect true)",
    partial_relation_match(test5_new, test5_old)
  );
  console.log(
    "undefined prop (expect false)",
    partial_relation_match(test6_old, test6_new)
  );
  console.log(
    "undefined prop 2 (expect false)",
    partial_relation_match(test7_old, test7_new)
  );
}
