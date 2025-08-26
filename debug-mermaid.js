// Simple test to see what Mermaid syntax would be generated
// This is just for debugging - not part of the extension

function mockGenerateFlowchart() {
  let nodeCounter = 0;
  const getNextId = () => `N${++nodeCounter}`;
  
  let mermaidLines = ['graph TD'];
  const startId = getNextId();
  const endId = getNextId();
  
  mermaidLines.push(`  ${startId}[Start]`);
  
  // Simulate some basic flow
  const node1 = getNextId();
  const node2 = getNextId();
  const node3 = getNextId();
  
  mermaidLines.push(`  ${node1}[Check if NaN]`);
  mermaidLines.push(`  ${startId} --> ${node1}`);
  mermaidLines.push(`  ${node1} -->|Yes| ${endId}`);
  mermaidLines.push(`  ${node1} -->|No| ${node2}`);
  mermaidLines.push(`  ${node2}[Check if negative]`);
  mermaidLines.push(`  ${node2} -->|Yes| ${endId}`);
  mermaidLines.push(`  ${node2} -->|No| ${node3}`);
  mermaidLines.push(`  ${node3}[Process loop]`);
  mermaidLines.push(`  ${node3} --> ${endId}`);
  mermaidLines.push(`  ${endId}[End]`);
  
  return mermaidLines.join('\n');
}

console.log('Sample Mermaid syntax:');
console.log(mockGenerateFlowchart());