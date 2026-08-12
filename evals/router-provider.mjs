const prompt = process.argv[2] ?? "";

const routes = [
  [/current|latest|documentation|api|version/i, "current-docs"],
  [/symbol|reference|rename|semantic/i, "serena-symbolic-code"],
  [/ast|codemod|syntax|structural/i, "structural-code-search"],
  [/large|repository map|token budget/i, "large-codebase-map"],
  [/browser|form|navigation|web flow/i, "browser-qa"],
  [/performance|lcp|cls|trace/i, "performance-report"],
  [/dependency|cycle|module boundary/i, "dependency-architecture"],
  [/mcp|plugin|hook|supply chain/i, "agent-supply-chain"],
  [/report|sarif|findings|audit/i, "evidence-report"],
  [/verify|complete|evidence/i, "verification-gate"],
];

console.log(routes.find(([pattern]) => pattern.test(prompt))?.[1] ?? "workflow-router");
