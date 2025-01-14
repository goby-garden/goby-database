console.log('----------------------------')
console.log('running sandbox test file...')


import Project from './index.js';
const project=new Project(':memory:');


//A starting class with a name field
let base_id=project.action_create_class('base');

console.log('project.class_cache',project.class_cache);
