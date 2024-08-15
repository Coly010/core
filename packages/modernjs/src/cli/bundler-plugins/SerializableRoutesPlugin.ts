import fs from 'fs';
import { webpack } from '@modern-js/app-tools';
import { generateSerializableRoutes } from '../ast';

export const SERIALIZABLE_ROUTES = 'serializable-routes.json';

class SerializableRoutesPlugin implements webpack.WebpackPluginInstance {
  routesFilePath: string;
  prefix: string;

  constructor(options: { routesFilePath: string; prefix: string }) {
    const { routesFilePath, prefix } = options;
    this.routesFilePath = routesFilePath;
    this.prefix = prefix;
  }
  apply(compiler: webpack.Compiler) {
    compiler.hooks.thisCompilation.tap('generateStats', (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        {
          name: 'generateSerializableRoutes',
          // @ts-ignore use runtime variable in case peer dep not installed
          stage: compilation.constructor.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER,
        },
        async () => {
          const sourceCode = fs.readFileSync(this.routesFilePath, 'utf-8');

          const routesCode = generateSerializableRoutes({
            sourceCode,
            prefix: this.prefix,
          });
          compilation.emitAsset(
            SERIALIZABLE_ROUTES,
            new compiler.webpack.sources.RawSource(
              JSON.stringify(routesCode, null, 2),
            ),
          );
        },
      );
    });
  }
}
export { SerializableRoutesPlugin };
