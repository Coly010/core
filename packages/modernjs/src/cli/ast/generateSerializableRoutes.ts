import traverse from '@babel/traverse';
import * as babelParser from '@babel/parser';
import generate from '@babel/generator';
import * as t from '@babel/types';
import {
  COMPONENT,
  ID,
  SHOULD_REVALIDATE,
  LAZY_COMPONENT,
  PRIVATE_COMPONENT,
  LOADER,
} from './constant';

function generateSerializableRoutes({
  sourceCode,
  prefix,
}: {
  sourceCode: string;
  prefix: string;
}) {
  const ast = babelParser.parse(sourceCode, {
    sourceType: 'module',
  });

  const removedKeys = [
    COMPONENT,
    SHOULD_REVALIDATE,
    LAZY_COMPONENT,
    PRIVATE_COMPONENT,
    LOADER,
  ];

  traverse(ast, {
    ObjectExpression(path) {
      if (!Array.isArray(path.node.properties)) {
        return;
      }
      path.node.properties.forEach((prop) => {
        if (
          t.isObjectProperty(prop) &&
          t.isStringLiteral(prop.key) &&
          t.isStringLiteral(prop.value) &&
          prop.key.value === ID
        ) {
          prop.value = t.stringLiteral(`${prefix}${prop.value.value}`);
        }
      });

      path.node.properties = path.node.properties.filter((p) => {
        if (t.isObjectProperty(p) && t.isStringLiteral(p.key)) {
          return !removedKeys.includes(p.key.value);
        } else {
          return true;
        }
      });
    },
  });

  let routesValue = '';
  traverse(ast, {
    VariableDeclarator(path) {
      if (
        t.isVariableDeclarator(path.node) &&
        t.isIdentifier(path.node.id) &&
        path.node.id.name === 'routes'
      ) {
        const routesAst = path.node.init;
        if (!routesAst) {
          return;
        }
        const { code } = generate(routesAst, {
          compact: true,
          retainLines: false,
          concise: true,
        });
        routesValue = eval('(' + code + ')');
      }
    },
  });

  return routesValue;
}

export { generateSerializableRoutes };
