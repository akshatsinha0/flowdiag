import * as vscode from 'vscode';
import { Parser, Language } from 'web-tree-sitter';
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
    if (lastNodeId !== endId) {
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
      
      const conditionText = getNodeText(stmt.children?.find((c: any) => c.type === 'parenthesized_expression')) || 'condition';
      mermaidLines.push(`  ${nodeId}{${conditionText}}`);
      mermaidLines.push(`  ${prevNodeId} --> ${nodeId}`);
      
      
      const thenStmt = stmt.children?.find((c: any) => c.type === 'statement_block' || c.type === 'block_statement');
      const thenEndId = getNextId();
      if (thenStmt) {
        const thenLastId = processStatements(thenStmt.children || [thenStmt], nodeId, endId, mermaidLines, getNextId);
        mermaidLines.push(`  ${nodeId} -->|Yes| ${thenLastId === nodeId ? thenEndId : thenLastId}`);
        if (thenLastId === nodeId) {
          mermaidLines.push(`  ${thenEndId}[Then]`);
        }
      }
      
      
      const elseStmt = stmt.children?.find((c: any) => c.type === 'else_clause');
      if (elseStmt) {
        const elseBody = elseStmt.children?.find((c: any) => c.type === 'statement_block' || c.type === 'block_statement');
        if (elseBody) {
          const elseLastId = processStatements(elseBody.children || [], nodeId, endId, mermaidLines, getNextId);
          mermaidLines.push(`  ${nodeId} -->|No| ${elseLastId}`);
        }
      } else {
        mermaidLines.push(`  ${nodeId} -->|No| ${thenEndId}`);
      }
      
      return thenEndId;
    }
    
    case 'for_statement':
    case 'while_statement': {
      const loopText = stmt.type === 'for_statement' ? 'for loop' : 'while loop';
      mermaidLines.push(`  ${nodeId}{${loopText}}`);
      mermaidLines.push(`  ${prevNodeId} --> ${nodeId}`);
      
      
      const body = stmt.children?.find((c: any) => c.type === 'statement_block' || c.type === 'block_statement');
      if (body) {
        const bodyLastId = processStatements(body.children || [], nodeId, endId, mermaidLines, getNextId);
        mermaidLines.push(`  ${nodeId} -->|Enter| ${bodyLastId}`);
        mermaidLines.push(`  ${bodyLastId} --> ${nodeId}`);
      }
      
      const exitId = getNextId();
      mermaidLines.push(`  ${exitId}[Continue]`);
      mermaidLines.push(`  ${nodeId} -->|Exit| ${exitId}`);
      return exitId;
    }
    
    case 'return_statement': {
      const returnText = getNodeText(stmt) || 'return';
      mermaidLines.push(`  ${nodeId}[${returnText}]`);
      mermaidLines.push(`  ${prevNodeId} --> ${nodeId}`);
      mermaidLines.push(`  ${nodeId} --> ${endId}`);
      return nodeId;
    }
    
    default: {
      
      const stmtText = getNodeText(stmt) || stmt.type;
      const cleanText = stmtText.length > 30 ? stmtText.substring(0, 30) + '...' : stmtText;
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


function getMermaidWebViewContent(diagramText: string) {
  return `
  <!DOCTYPE html>
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
    </style>
  </head>
  <body>
    <h2>Function Flowchart</h2>
    <div class="mermaid">
      ${diagramText}
    </div>
    <script>
      mermaid.initialize({
        startOnLoad: true,
        theme: 'default',
        flowchart: { useMaxWidth: true, htmlLabels: true }
      });
    </script>
  </body>
  </html>`;
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('FlowDiag extension is activating...');
  
  let parser: Parser | null = null;
  let jsLang: Language | null = null;
  let tsLang: Language | null = null;
  let isInitialized = false;

  // Initialize Tree-sitter asynchronously
  const initializeParser = async () => {
    try {
      console.log('=== Starting Tree-sitter initialization ===');

      // Resolve extension root path early
      let extensionRoot = context.extensionPath || context.extensionUri?.fsPath || __dirname;
      if (!extensionRoot) extensionRoot = path.dirname(__dirname);
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

      console.log('Step 1: Calling Parser.init()...');
      await Parser.init({ locateFile: () => runtimeWasmPath } as any);
      console.log('✓ Parser.init() completed successfully');
      
      console.log('Step 2: Debugging extension context...');
      console.log('Full context object keys:', Object.keys(context));
      console.log('Extension context info:', {
        extensionPath: context.extensionPath,
        extensionUri: context.extensionUri?.toString(),
        globalStorageUri: context.globalStorageUri?.toString(),
        extensionMode: context.extensionMode,
        environmentVariableCollection: !!context.environmentVariableCollection
      });
      
      // Try to find the extension path in different ways
      const possiblePaths = [
        context.extensionPath,
        context.extensionUri?.fsPath,
        __dirname,
        process.cwd()
      ];
      console.log('Possible extension paths:', possiblePaths);
      
      // Use extensionPath as fallback if extensionUri is undefined
      let jsWasmUri: vscode.Uri;
      let tsWasmUri: vscode.Uri;
      
      if (context.extensionUri) {
        jsWasmUri = vscode.Uri.joinPath(context.extensionUri, 'media', 'tree-sitter-javascript.wasm');
        tsWasmUri = vscode.Uri.joinPath(context.extensionUri, 'media', 'tree-sitter-typescript.wasm');
      } else {
        // Fallback to using extensionPath
        const jsPath = path.join(extensionRoot, 'media', 'tree-sitter-javascript.wasm');
        const tsPath = path.join(extensionRoot, 'media', 'tree-sitter-typescript.wasm');
        jsWasmUri = vscode.Uri.file(jsPath);
        tsWasmUri = vscode.Uri.file(tsPath);
      }
      
      console.log('✓ WASM URIs created:', { 
        js: jsWasmUri.toString(), 
        ts: tsWasmUri.toString() 
      });
      
      console.log('Step 3: Determining extension path...');
      let extensionPath = extensionRoot;
      
      console.log('Using extension path:', extensionPath);
      
      console.log('Step 4: Reading JavaScript WASM file with Node.js fs...');
      const jsWasmPath = path.join(extensionPath, 'media', 'tree-sitter-javascript.wasm');
      console.log('JavaScript WASM path:', jsWasmPath);
      console.log('File exists?', fs.existsSync(jsWasmPath));
      
      const jsWasmBuffer = fs.readFileSync(jsWasmPath);
      console.log('✓ JavaScript WASM file read, size:', jsWasmBuffer.length, 'bytes');
      
      console.log('Step 5: Loading JavaScript Language...');
      jsLang = await Language.load(jsWasmBuffer);
      console.log('✓ JavaScript Language loaded successfully');
      
      console.log('Step 6: Reading TypeScript WASM file with Node.js fs...');
      const tsWasmPath = path.join(extensionPath, 'media', 'tree-sitter-typescript.wasm');
      console.log('TypeScript WASM path:', tsWasmPath);
      console.log('File exists?', fs.existsSync(tsWasmPath));
      
      const tsWasmBuffer = fs.readFileSync(tsWasmPath);
      console.log('✓ TypeScript WASM file read, size:', tsWasmBuffer.length, 'bytes');
      
      console.log('Step 7: Loading TypeScript Language...');
      tsLang = await Language.load(tsWasmBuffer);
      console.log('✓ TypeScript Language loaded successfully');
      
      console.log('Step 8: Creating Parser instance...');
      parser = new Parser();
      console.log('✓ Parser instance created');
      
      isInitialized = true;
      console.log('=== Tree-sitter initialization completed successfully ===');
      vscode.window.showInformationMessage('FlowDiag: Parser initialized successfully!');
    } catch (error) {
      console.error('=== Tree-sitter initialization FAILED ===');
      console.error('Error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      vscode.window.showErrorMessage(`FlowDiag: Failed to initialize parser - ${error}`);
      isInitialized = false;
    }
  };

  // Start initialization but don't wait for it
  initializeParser();

  
  context.subscriptions.push(
    vscode.commands.registerCommand('flowdiag.debugParse', async () => {
      console.log('Debug Parse command executed');
      
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
      const childTypes = tree.rootNode.children
        .filter((n): n is NonNullable<typeof n> => n !== null)
        .map(n => n.type);
      console.log('Child types:', childTypes);

      vscode.window.showInformationMessage('Parsing complete! See Debug Console.');
    })
  );

  
  context.subscriptions.push(
    vscode.commands.registerCommand('flowdiag.showFlowchart', async () => {
      console.log('Show Flowchart command executed');
      
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

      
      const mermaidText = generateFlowchart(fnNode);

      
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
      await initializeParser();
    })
  );

  console.log('FlowDiag extension activated successfully');
}

export function deactivate() {}
