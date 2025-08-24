# FlowDiag

Generate quick Mermaid flowcharts for the function under your cursor in JS/TS files. It uses web-tree-sitter to parse code and opens a webview with the diagram.

## Commands
- FlowDiag: Test Extension (`flowdiag.test`) — shows parser status
- FlowDiag: Debug Parse (`flowdiag.debugParse`) — logs parse info for the active file
- FlowDiag: Show Flowchart (`flowdiag.showFlowchart`) — opens a Mermaid diagram for the function under cursor
- FlowDiag: Retry Initialization (`flowdiag.retryInit`) — re-initializes the parser

## Notes
- Requires internet to load Mermaid from CDN in the webview
- Supports JavaScript and TypeScript
