import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import ts from "typescript";

const scopes = ["src/application/ports/", "src/application/contracts/", "src/domain/types/"];
const declarationKinds = new Set([
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.ClassDeclaration,
]);
const signatureKinds = new Set([
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.CallSignature,
  ts.SyntaxKind.ConstructSignature,
  ts.SyntaxKind.FunctionType,
  ts.SyntaxKind.ConstructorType,
]);
const analyses = new WeakMap();

function projectPath(cwd, fileName) {
  return relative(cwd, fileName).split(sep).join(posix.sep);
}

function isExported(statement) {
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function describe(node) {
  return node.kind === ts.SyntaxKind.AnyKeyword ? "any" : "unknown";
}

function location(node) {
  const file = node.getSourceFile();
  const at = (position) => {
    const { line, character } = file.getLineAndCharacterOfPosition(position);
    return { line: line + 1, column: character };
  };
  return { start: at(node.getStart()), end: at(node.getEnd()) };
}

// Walks port-facing types with a direction: true while a value flows from an adapter to the inside.
function analyze(program, cwd) {
  const checker = program.getTypeChecker();
  const reports = new Map();
  const memo = new Map();
  const inScope = (file) => {
    const path = projectPath(cwd, file.fileName);
    return scopes.some((scope) => path.startsWith(scope)) && !path.endsWith(".test.ts");
  };
  const isExternal = (file) =>
    file.isDeclarationFile ||
    program.isSourceFileFromExternalLibrary(file) ||
    program.isSourceFileDefaultLibrary(file);

  function report(node, what) {
    const file = resolve(node.getSourceFile().fileName);
    if (!reports.has(file)) reports.set(file, new Map());
    reports.get(file).set(node.getStart(), { loc: location(node), what });
  }

  // Reports open leaves in scope; returns a description of one reached outside scope.
  function visit(node, inward) {
    if (!node) return undefined;
    if (node.kind === ts.SyntaxKind.UnknownKeyword || node.kind === ts.SyntaxKind.AnyKeyword) {
      return leaf(node, inward);
    }
    if (signatureKinds.has(node.kind)) {
      let hidden;
      for (const parameter of node.parameters) hidden ??= visit(parameter.type, !inward);
      return visit(node.type, inward) ?? hidden;
    }
    if (node.kind === ts.SyntaxKind.TypeReference) return reference(node, node.typeName, inward);
    if (node.kind === ts.SyntaxKind.ExpressionWithTypeArguments) {
      return reference(node, node.expression, inward);
    }
    if (declarationKinds.has(node.kind)) return declaration(node, inward);
    if (
      node.kind === ts.SyntaxKind.TypeQuery ||
      node.kind === ts.SyntaxKind.TypeParameter ||
      node.kind === ts.SyntaxKind.Identifier ||
      (node.kind === ts.SyntaxKind.TypeOperator && node.operator === ts.SyntaxKind.KeyOfKeyword)
    ) {
      return undefined;
    }
    if (node.kind === ts.SyntaxKind.MappedType) return visit(node.type, inward);
    let hidden;
    ts.forEachChild(node, (child) => {
      hidden ??= visit(child, inward);
    });
    return hidden;
  }

  function leaf(node, inward) {
    if (!inward) return undefined;
    if (!inScope(node.getSourceFile())) return describe(node);
    report(node, describe(node));
    return undefined;
  }

  function reference(node, name, inward) {
    let hidden;
    for (const argument of node.typeArguments ?? []) hidden ??= visit(argument, inward);
    let symbol = checker.getSymbolAtLocation(name);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    for (const target of symbol?.declarations ?? []) {
      const file = target.getSourceFile();
      if (!declarationKinds.has(target.kind) || isExternal(file)) continue;
      const found = declaration(target, inward);
      if (found && inScope(node.getSourceFile())) {
        report(node, `${symbol.name} (${found})`);
      } else hidden ??= found;
    }
    return hidden;
  }

  function declaration(node, inward) {
    const key = `${inward}:${node.getSourceFile().fileName}:${node.pos}`;
    if (memo.has(key)) return memo.get(key);
    // A recursive reference ends here as closed; the first visit reports its leaves.
    memo.set(key, undefined);
    let hidden;
    if (node.kind === ts.SyntaxKind.TypeAliasDeclaration) hidden = visit(node.type, inward);
    else {
      for (const clause of node.heritageClauses ?? []) {
        for (const type of clause.types) hidden ??= visit(type, inward);
      }
      for (const member of node.members) hidden ??= visit(member, inward);
    }
    memo.set(key, hidden);
    return hidden;
  }

  for (const file of program.getSourceFiles()) {
    if (!inScope(file) || !projectPath(cwd, file.fileName).startsWith(scopes[0])) continue;
    for (const statement of file.statements) {
      if (
        statement.kind === ts.SyntaxKind.InterfaceDeclaration &&
        isExported(statement) &&
        statement.members.some((member) => signatureKinds.has(member.kind))
      ) {
        declaration(statement, true);
      }
    }
  }
  return reports;
}

export default {
  meta: {
    type: "problem",
    schema: [],
    messages: { open: "Open type crosses a port inward: {{what}}." },
  },
  create(context) {
    const program = context.sourceCode.parserServices?.program;
    if (!program) throw new Error("closed-port-types requires type information.");
    if (!analyses.has(program)) analyses.set(program, analyze(program, context.cwd));
    const file = isAbsolute(context.filename) ? context.filename : resolve(context.filename);
    return {
      Program() {
        for (const { loc, what } of analyses.get(program).get(resolve(file))?.values() ?? []) {
          context.report({ loc, messageId: "open", data: { what } });
        }
      },
    };
  },
};
