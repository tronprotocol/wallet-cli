function propertyName(node) {
  const property = node.property ?? node.key;
  if (!node.computed && property.type === "Identifier") return property.name;
  if (property.type === "Literal") return property.value;
  if (property.type === "TemplateLiteral" && property.expressions.length === 0) {
    return property.quasis[0].value.cooked;
  }
}

const expressionWrappers = [
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSSatisfiesExpression",
];

function unwrap(node) {
  while (expressionWrappers.includes(node.type)) {
    node = node.expression;
  }
  return node;
}

function binding(sourceCode, node) {
  for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(node.name);
    if (variable && variable.isValueVariable !== false) return variable;
  }
}

function isGlobal(sourceCode, node, name) {
  return (
    node.type === "Identifier" && node.name === name && !binding(sourceCode, node)?.defs.length
  );
}

function imported(sourceCode, node, name) {
  if (node.type !== "Identifier") return false;
  return (
    binding(sourceCode, node)?.defs.some((definition) => {
      if (
        definition.type !== "ImportBinding" ||
        !["process", "node:process"].includes(definition.parent.source.value)
      )
        return false;
      const specifier = definition.node;
      if (name === "process") {
        return (
          ["ImportDefaultSpecifier", "ImportNamespaceSpecifier"].includes(specifier.type) ||
          (specifier.imported?.name ?? specifier.imported?.value) === "default"
        );
      }
      return (
        specifier.type === "ImportSpecifier" &&
        (specifier.imported.name ?? specifier.imported.value) === name
      );
    }) ?? false
  );
}

function isProcess(sourceCode, expression) {
  const node = unwrap(expression);
  if (isGlobal(sourceCode, node, "process") || imported(sourceCode, node, "process")) return true;
  if (node.type === "MemberExpression" && propertyName(node) === "process") {
    return (
      isGlobal(sourceCode, node.object, "globalThis") || isGlobal(sourceCode, node.object, "global")
    );
  }
  return (
    node.type === "CallExpression" &&
    isGlobal(sourceCode, node.callee, "require") &&
    node.arguments.length === 1 &&
    ["process", "node:process"].includes(node.arguments[0].value)
  );
}

function isWriteOnly(node) {
  let target = node;
  while (expressionWrappers.includes(target.parent.type)) target = target.parent;
  if (target.parent.type === "MemberExpression" && target.parent.object === target)
    target = target.parent;
  for (;;) {
    const parent = target.parent;
    if (expressionWrappers.includes(parent.type)) {
      target = parent;
      continue;
    }
    if (parent.type === "AssignmentExpression")
      return parent.left === target && parent.operator === "=";
    if (parent.type === "UnaryExpression")
      return parent.argument === target && parent.operator === "delete";
    if (["ForInStatement", "ForOfStatement"].includes(parent.type)) return parent.left === target;
    if (
      (parent.type === "Property" &&
        parent.value === target &&
        parent.parent.type === "ObjectPattern") ||
      ["ObjectPattern", "ArrayPattern", "RestElement"].includes(parent.type) ||
      (parent.type === "AssignmentPattern" && parent.left === target)
    ) {
      target = parent;
    } else return false;
  }
}

export default {
  meta: {
    type: "problem",
    schema: [],
    messages: { read: "Read environment values in bootstrap or an approved environment module." },
  },
  create(context) {
    const { sourceCode } = context;
    function reportRead(node) {
      if (!isWriteOnly(node)) context.report({ node, messageId: "read" });
    }
    function destructuring(pattern, source) {
      if (pattern.type !== "ObjectPattern" || !source || !isProcess(sourceCode, source)) return;
      for (const property of pattern.properties) {
        if (property.type === "Property" && propertyName(property) === "env") {
          context.report({ node: property, messageId: "read" });
        }
      }
    }
    return {
      MemberExpression(node) {
        if (propertyName(node) === "env" && isProcess(sourceCode, node.object)) reportRead(node);
      },
      Identifier(node) {
        // Type queries resolve value bindings but are erased at runtime.
        if (
          imported(sourceCode, node, "env") &&
          binding(sourceCode, node).references.some(
            (reference) => reference.identifier === node && reference.isValueReference !== false,
          ) &&
          !sourceCode.getAncestors(node).some((ancestor) => ancestor.type === "TSTypeQuery")
        )
          reportRead(node);
      },
      VariableDeclarator(node) {
        destructuring(node.id, node.init);
      },
      AssignmentExpression(node) {
        destructuring(node.left, node.right);
      },
    };
  },
};
