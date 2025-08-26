import * as vscode from 'vscode';
// runtime import for web-tree-sitter to avoid bundling issues
import * as fs from 'fs';
import * as path from 'path';


function findFunctionNode(tree: any, position: vscode.Position): any | null {
  let foundNode = null;
  function search(node: any) {
    if (
      node.startPosition.row <= position.line &&
      node.endPosition.row >= position.line
    ) {
      if (
        node.type === 'function_declaration' ||
        node.type === 'arrow_function' ||
        node.type === 'method_definition'
      ) {
        foundNode = node;
      }
      for (const child of node.children || []) {
        search(child);
      }
    }
  }
  search(tree.rootNode);
  return foundNode;
}


function generateFlowchart(fnNode: any): string {
  let nodeCounter = 0;
  const getNextId = () => `N${++nodeCounter}`;
  
  let mermaidLines: string[] = ['graph TD'];
  const startId = getNextId();
  const endId = getNextId();
  
  mermaidLines.push(`  ${startId}[Start]`);
  
  const body = fnNode.children?.find((child: any) => 
    child.type === 'statement_block' || child.type === 'block_statement'
  );
  
  if (body) {
    const lastNodeId = processStatements(body.children || [], startId, endId, mermaidLines, getNextId);
    if (lastNodeId !== endId && lastNodeId !== startId) {
      mermaidLines.push(`  ${lastNodeId} --> ${endId}`);
    }
  } else {
    mermaidLines.push(`  ${startId} --> ${endId}`);
  }
  
  mermaidLines.push(`  ${endId}[End]`);
  
  return mermaidLines.join('\n');
}


function processStatements(statements: any[], prevNodeId: string, endId: string, mermaidLines: string[], getNextId: () => string): string {
  let currentNodeId = prevNodeId;
  
  for (const stmt of statements) {
    if (!stmt || stmt.type === '{' || stmt.type === '}') {
      continue;
    }
    
    const nextNodeId = processStatement(stmt, currentNodeId, endId, mermaidLines, getNextId);
    currentNodeId = nextNodeId;
  }
  
  return currentNodeId;
}


function processStatement(stmt: any, prevNodeId: string, endId: string, mermaidLines: string[], getNextId: () => string): string {
  const nodeId = getNextId();
  
  switch (stmt.type) {
    case 'if_statement': {
      const conditionTextRaw = getNodeText(stmt.children?.find((c: any) => c.type === 'parenthesized_expression')) || 'condition';
      const conditionText = sanitizeLabel(conditionTextRaw);
      mermaidLines.push(`  ${nodeId}{${conditionText}}`);
      mermaidLines.push(`  ${prevNodeId} --> ${nodeId}`);
      
      const continueId = getNextId();
      
      // Find the actual statement after if condition (not the parenthesized expression)
      const statements = stmt.children?.filter((c: any) => 
        c.type !== 'if' && 
        c.type !== 'parenthesized_expression' && 
        c.type !== 'else_clause'
      ) || [];
      
      // Process then branch (first non-condition statement)
      if (statements.length > 0) {
        const thenStmt = statements[0];
        if (thenStmt.type === 'return_statement') {
          const returnId = getNextId();
          const returnText = sanitizeLabel(getNodeText(thenStmt) || 'return');
          mermaidLines.push(`  ${returnId}[${returnText}]`);
          mermaidLines.push(`  ${nodeId} -->|Yes| ${returnId}`);
          mermaidLines.push(`  ${returnId} --> ${endId}`);
        } else {
          const thenId = processStatement(thenStmt, nodeId, endId, mermaidLines, getNextId);
          mermaidLines.push(`  ${nodeId} -->|Yes| ${thenId}`);
          if (thenId !== endId) {
            mermaidLines.push(`  ${thenId} --> ${continueId}`);
          }
        }
      } else {
        mermaidLines.push(`  ${nodeId} -->|Yes| ${continueId}`);
      }
      
      // Process else branch
      const elseStmt = stmt.children?.find((c: any) => c.type === 'else_clause');
      if (elseStmt) {
        const elseStatements = elseStmt.children?.filter((c: any) => 
          c.type !== 'else' && c.type !== '{'  && c.type !== '}'
        ) || [];
        
        if (elseStatements.length > 0) {
          const elseFirstStmt = elseStatements[0];
          if (elseFirstStmt.type === 'return_statement') {
            const returnId = getNextId();
            const returnText = sanitizeLabel(getNodeText(elseFirstStmt) || 'return');
            mermaidLines.push(`  ${returnId}[${returnText}]`);
            mermaidLines.push(`  ${nodeId} -->|No| ${returnId}`);
            mermaidLines.push(`  ${returnId} --> ${endId}`);
          } else {
            const elseId = processStatement(elseFirstStmt, nodeId, endId, mermaidLines, getNextId);
            mermaidLines.push(`  ${nodeId} -->|No| ${elseId}`);
            if (elseId !== endId) {
              mermaidLines.push(`  ${elseId} --> ${continueId}`);
            }
          }
        } else {
          mermaidLines.push(`  ${nodeId} -->|No| ${continueId}`);
        }
      } else {
        mermaidLines.push(`  ${nodeId} -->|No| ${continueId}`);
      }
      
      return continueId;
    }
    
    case 'for_statement':
    case 'while_statement': {
      const loopText = stmt.type === 'for_statement' ? 'for loop' : 'while loop';
      mermaidLines.push(`  ${nodeId}{${loopText}}`);
      mermaidLines.push(`  ${prevNodeId} --> ${nodeId}`);
      
      const exitId = getNextId();
      mermaidLines.push(`  ${exitId}[Continue]`);
      
      // Process loop body
      const body = stmt.children?.find((c: any) => c.type === 'statement_block' || c.type === 'block_statement');
      if (body) {
        const bodyLastId = processStatements(body.children || [], nodeId, endId, mermaidLines, getNextId);
        mermaidLines.push(`  ${nodeId} -->|Enter| ${bodyLastId}`);
        if (bodyLastId !== endId) {
          mermaidLines.push(`  ${bodyLastId} --> ${nodeId}`);
        }
      }
      
      mermaidLines.push(`  ${nodeId} -->|Exit| ${exitId}`);
      return exitId;
    }
    
    case 'return_statement': {
      const returnText = sanitizeLabel(getNodeText(stmt) || 'return');
      mermaidLines.push(`  ${nodeId}[${returnText}]`);
      mermaidLines.push(`  ${prevNodeId} --> ${nodeId}`);
      mermaidLines.push(`  ${nodeId} --> ${endId}`);
      return endId; // Return endId to prevent further connections
    }
    
    default: {
      
      const stmtText = getNodeText(stmt) || stmt.type;
      const cleanText = sanitizeLabel(stmtText.length > 60 ? stmtText.substring(0, 60) : stmtText);
      mermaidLines.push(`  ${nodeId}[${cleanText}]`);
      mermaidLines.push(`  ${prevNodeId} --> ${nodeId}`);
      return nodeId;
    }
  }
}


function getNodeText(node: any): string {
  if (!node) {
    return '';
  }
  
  
  if (node.text) {
    return node.text.replace(/\n/g, ' ').trim();
  }
  
  
  return node.type || '';
}


function escapeHtml(s:string){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sanitizeLabel(s:string){
  // simple, safe labels for Mermaid nodes
  return s
    .replace(/\n/g,' ')
    .replace(/\|/g,'¦')
    .replace(/\[/g,'(')
    .replace(/\]/g,')')
    .replace(/\{/g,'(')
    .replace(/\}/g,')')
    .trim()
    .slice(0,60);
}

function getMermaidWebViewContent(diagramText: string) {
  // Escape the diagram text properly for HTML insertion
  const escapedDiagramText = diagramText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; script-src https: 'unsafe-inline'; style-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FlowDiag</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .mermaid { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .error { color: red; padding: 20px; background: #ffe6e6; border-radius: 4px; margin: 10px 0; }
  </style>
</head>
<body>
  <h2>Function Flowchart</h2>
  <pre id="debug" style="background: #f0f0f0; padding: 10px; font-size: 12px; display: none;">${escapedDiagramText}</pre>
  <button onclick="document.getElementById('debug').style.display = document.getElementById('debug').style.display === 'none' ? 'block' : 'none'">Toggle Debug</button>
  <div class="mermaid">${diagramText}</div>
  <script>
    try {
      mermaid.initialize({
        startOnLoad: true,
        theme: 'default',
        flowchart: { useMaxWidth: true, htmlLabels: true },
        logLevel: 'error'
      });
    } catch (error) {
      console.error('Mermaid initialization error:', error);
      document.body.innerHTML += '<div class="error">Mermaid initialization failed: ' + error.message + '</div>';
    }
    
    // Add error handling
    window.addEventListener('error', function(e) {
      console.error('Runtime error:', e.error);
      document.body.innerHTML += '<div class="error">Runtime error: ' + e.error.message + '</div>';
    });
  </script>
</body>
</html>`;
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('FlowDiag extension is activating...');
  
  let parser: any | null = null;
  let jsLang: any | null = null;
  let tsLang: any | null = null;
  let isInitialized = false;
  let parserReady:Promise<void>|null=null;

  // Initialize Tree-sitter asynchronously with runtime ESM import
  const initializeParser = async () => {
    try {
      console.log('=== Starting Tree-sitter initialization ===');

      // Resolve extension root path early
      let extensionRoot = context.extensionPath || context.extensionUri?.fsPath || __dirname;
      if (!extensionRoot) { extensionRoot = path.dirname(__dirname); }
      console.log('Resolved extension root:', extensionRoot);

      // Compute a robust runtime wasm path: prefer dist/media in packaged builds, fallback to media
      const runtimeCandidates = [
        path.join(extensionRoot, 'dist', 'media', 'tree-sitter.wasm'),
        path.join(extensionRoot, 'media', 'tree-sitter.wasm')
      ];
      const runtimeWasmPath = runtimeCandidates.find(p => {
        try { return fs.existsSync(p); } catch { return false; }
      }) || runtimeCandidates[0];
      console.log('Runtime wasm candidate chosen:', runtimeWasmPath);

      console.log('Step 1: Dynamically importing web-tree-sitter...');
      const {Parser,Language} = await import('web-tree-sitter') as any;

      console.log('Step 2: Calling Parser.init() with locateFile...');
      await Parser.init({ locateFile: () => runtimeWasmPath });
      console.log('✓ Parser.init() completed successfully');
      
      console.log('Step 3: Locating language WASM files...');
      let extensionPath = extensionRoot;
      const jsWasmPath = path.join(extensionPath, 'media', 'tree-sitter-javascript.wasm');
      const tsWasmPath = path.join(extensionPath, 'media', 'tree-sitter-typescript.wasm');
      console.log('JavaScript WASM path:', jsWasmPath, 'exists?', fs.existsSync(jsWasmPath));
      console.log('TypeScript WASM path:', tsWasmPath, 'exists?', fs.existsSync(tsWasmPath));

      console.log('Step 4: Reading language WASM buffers...');
      const jsWasmBuffer = fs.readFileSync(jsWasmPath);
      const tsWasmBuffer = fs.readFileSync(tsWasmPath);

      console.log('Step 5: Loading languages...');
      jsLang = await Language.load(jsWasmBuffer);
      tsLang = await Language.load(tsWasmBuffer);

      console.log('Step 6: Creating Parser instance...');
      parser = new Parser();

      isInitialized = true;
      console.log('=== Tree-sitter initialization completed successfully ===');
      vscode.window.showInformationMessage('FlowDiag: Parser initialized successfully!');
    } catch (error) {
      console.error('=== Tree-sitter initialization FAILED ===');
      console.error('Error:', error);
      console.error('Error stack:', error instanceof Error ? (error as Error).stack : 'No stack trace');
      vscode.window.showErrorMessage(`FlowDiag: Failed to initialize parser - ${error}`);
      isInitialized = false;
      throw error;
    }
  };

  // Start initialization but don't wait for it; also keep a readiness promise
  parserReady=initializeParser();

  
  context.subscriptions.push(
    vscode.commands.registerCommand('flowdiag.debugParse', async () => {
      console.log('Debug Parse command executed');
      
      try{await parserReady;}catch{ /* already surfaced */ }
      if (!isInitialized || !parser || !jsLang || !tsLang) {
        vscode.window.showErrorMessage('Parser not initialized. Please wait a moment and try again.');
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Open a JS/TS file first.');
        return;
      }
      const doc = editor.document;

      
      parser.setLanguage(doc.languageId === 'typescript' ? tsLang : jsLang);

      
      const tree = parser.parse(doc.getText());
      if (!tree) {
        vscode.window.showErrorMessage('Parsing failed');
        return;
      }

      
      const position = editor.selection.active;
      const fnNode = findFunctionNode(tree, position);

      if (fnNode) {
        vscode.window.showInformationMessage(`Function found: ${fnNode.type}`);
        console.log('Function node:', fnNode);
      } else {
        vscode.window.showInformationMessage('No function found under cursor.');
      }

      
      console.log('Root node type:', tree.rootNode.type);
      const childTypes = (tree.rootNode.children as any[])
        .filter((n:any)=>n!==null && n!==undefined)
        .map((n:any)=>n.type as string);
      console.log('Child types:', childTypes);

      vscode.window.showInformationMessage('Parsing complete! See Debug Console.');
    })
  );

  
  context.subscriptions.push(
    vscode.commands.registerCommand('flowdiag.showFlowchart', async () => {
      console.log('Show Flowchart command executed');
      
      try{await parserReady;}catch{ /* error already shown */ }
      if (!isInitialized || !parser || !jsLang || !tsLang) {
        vscode.window.showErrorMessage('Parser not initialized. Please wait a moment and try again.');
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Open a JS/TS file first.');
        return;
      }

      const doc = editor.document;
      parser.setLanguage(doc.languageId === 'typescript' ? tsLang : jsLang);
      const tree = parser.parse(doc.getText());
      const position = editor.selection.active;
      const fnNode = findFunctionNode(tree, position);

      if (!fnNode) {
        vscode.window.showInformationMessage('No function found under cursor.');
        return;
      }

      
      let mermaidText = generateFlowchart(fnNode);
      // Don't escape HTML - Mermaid needs the raw syntax
      console.log('Generated Mermaid text:', mermaidText);

      const panel = vscode.window.createWebviewPanel(
        'flowDiag',
        'Flow Diagram',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      panel.webview.html = getMermaidWebViewContent(mermaidText);
    })
  );

  
  context.subscriptions.push(
    vscode.commands.registerCommand('flowdiag.test', () => {
      console.log('FlowDiag test command executed');
      console.log('Parser status:', { isInitialized, parser: !!parser, jsLang: !!jsLang, tsLang: !!tsLang });
      if (isInitialized) {
        vscode.window.showInformationMessage('FlowDiag extension is working! Parser is ready.');
      } else {
        vscode.window.showInformationMessage('FlowDiag extension is working! Parser is still initializing...');
      }
    })
  );

  // Add a command to retry initialization
  context.subscriptions.push(
    vscode.commands.registerCommand('flowdiag.retryInit', async () => {
      vscode.window.showInformationMessage('Retrying parser initialization...');
      try{parserReady=initializeParser();await parserReady;}catch{/* error surfaced */}
    })
  );

  console.log('FlowDiag extension activated successfully');
}

export function deactivate() {}
