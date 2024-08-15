import path from 'path';
import { fs } from '@modern-js/utils';
import type { CliPlugin, AppTools } from '@modern-js/app-tools';
import type { RouteObject } from '@modern-js/runtime/router';
import type {
  DataLoaderOptions,
  InternalModernPluginOptions,
  TransformRuntimeOptions,
} from '../types';
import type { init } from '@module-federation/enhanced/runtime';
import { transformName2Prefix } from '../runtime/utils';
import { PLUGIN_IDENTIFIER } from '../constant';
import {
  MF_FULL_ROUTES,
  MF_SLIM_ROUTES,
  MF_ROUTES_META,
} from '../runtime/constant';
import { generateRoutes, generateSlimRoutes } from './ast';
import { MODERN_JS_FILE_SYSTEM_ROUTES_FILE_NAME, META_NAME } from './constant';
import {
  type moduleFederationPlugin,
  ManifestFileName,
} from '@module-federation/sdk';
import { getIPV4, replaceRemoteUrl } from './utils';
import {
  SerializableRoutesPlugin,
  SERIALIZABLE_ROUTES,
} from './bundler-plugins/SerializableRoutesPlugin';

function generateExtraExposeFiles(
  options: Parameters<Required<DataLoaderOptions>['patchMFConfig']>[0],
) {
  const { routesFilePath, mfConfig, isServer, baseName } = options;
  const outputDir = path.resolve(process.cwd(), 'node_modules/.federation');
  fs.ensureDirSync(outputDir);
  const addSuffix = (fileName: string) => {
    if (!isServer) {
      return `${fileName}.jsx`;
    }
    return `${fileName}.server.jsx`;
  };
  const routesFileContent = fs.readFileSync(routesFilePath, 'utf-8');

  const outputSlimRoutesPath = path.resolve(
    outputDir,
    addSuffix(MF_SLIM_ROUTES),
  );
  const outputFullRoutesPath = path.resolve(
    outputDir,
    addSuffix(MF_FULL_ROUTES),
  );
  const outputRoutesMetaPath = path.resolve(outputDir, `${MF_ROUTES_META}.js`);

  generateSlimRoutes({
    sourceCode: routesFileContent,
    filePath: outputSlimRoutesPath,
    prefix: transformName2Prefix(mfConfig.name!),
    baseName,
  });
  generateRoutes({
    sourceCode: routesFileContent,
    filePath: outputFullRoutesPath,
    prefix: transformName2Prefix(mfConfig.name!),
    baseName,
  });
  fs.writeFileSync(
    outputRoutesMetaPath,
    `export const baseName = '${baseName}';`,
  );

  return {
    outputSlimRoutesPath,
    outputFullRoutesPath,
    outputRoutesMetaPath,
  };
}
function addExpose(
  options: Parameters<Required<DataLoaderOptions>['patchMFConfig']>[0],
) {
  const { mfConfig } = options;
  const { outputSlimRoutesPath, outputFullRoutesPath, outputRoutesMetaPath } =
    generateExtraExposeFiles(options);

  const fullRoutesKey = `./${MF_FULL_ROUTES}`;
  const slimRoutesKey = `./${MF_SLIM_ROUTES}`;
  const routeMetaKey = `./${MF_ROUTES_META}`;

  if (!mfConfig.exposes) {
    mfConfig.exposes = {
      [fullRoutesKey]: outputFullRoutesPath,
      [slimRoutesKey]: outputSlimRoutesPath,
      [routeMetaKey]: outputRoutesMetaPath,
    };
  } else {
    if (!Array.isArray(mfConfig.exposes)) {
      if (!mfConfig.exposes[fullRoutesKey]) {
        mfConfig.exposes[fullRoutesKey] = outputFullRoutesPath;
      }
      if (!mfConfig.exposes[slimRoutesKey]) {
        mfConfig.exposes[slimRoutesKey] = outputSlimRoutesPath;
      }
      if (!mfConfig.exposes[routeMetaKey]) {
        mfConfig.exposes[routeMetaKey] = outputRoutesMetaPath;
      }
    }
  }
}
function addShared(
  options: Parameters<Required<DataLoaderOptions>['patchMFConfig']>[0],
) {
  const { metaName, mfConfig } = options;
  const alias = `@${metaName}/runtime/router`;
  if (!mfConfig.shared) {
    mfConfig.shared = {
      [alias]: { singleton: true },
    };
  } else {
    if (!Array.isArray(mfConfig.shared)) {
      mfConfig.shared[alias] = { singleton: true };
    } else {
      mfConfig.shared.push(alias);
    }
  }
}

function _pathMfConfig(
  options: Parameters<Required<DataLoaderOptions>['patchMFConfig']>[0],
) {
  addShared(options);
  addExpose(options);
}

async function _fetchSSRByRouteIds(
  partialSSRRemotes: string[],
  mfConfig: moduleFederationPlugin.ModuleFederationPluginOptions,
  transformRuntimeFn: TransformRuntimeOptions,
): Promise<undefined | string[]> {
  const partialMfConfig = {
    name: mfConfig.name!,
    remotes: { ...mfConfig.remotes },
  };
  replaceRemoteUrl(partialMfConfig, 'ipv4');
  const runtimeInitOptions = transformRuntimeFn(partialMfConfig);

  if (!runtimeInitOptions.remotes.length || !partialSSRRemotes.length) {
    return undefined;
  }

  const remoteProviderRouteIds: Set<string> = new Set();

  const collectIds = (route: RouteObject) => {
    remoteProviderRouteIds.add(route.id!);
    if (route.children) {
      route.children.forEach((r) => {
        collectIds(r);
      });
    }
  };

  await Promise.all(
    runtimeInitOptions.remotes.map(async (remote) => {
      const entry = 'entry' in remote ? remote.entry : '';
      if (!entry) {
        return undefined;
      }
      const ipv4 = getIPV4();
      const url = new URL(entry);
      const serializableRoutesUrl = url.href
        .replace(url.pathname, `/${SERIALIZABLE_ROUTES}`)
        .replace('localhost', ipv4);
      const serializableRoutesRet = await fetch(serializableRoutesUrl);
      const serializableRoutes =
        (await serializableRoutesRet.json()) as RouteObject[];
      serializableRoutes.forEach((serializableRoute) => {
        collectIds(serializableRoute);
      });
    }),
  );

  return [...remoteProviderRouteIds];
}

function _transformRuntimeOptions(
  buildOptions: moduleFederationPlugin.ModuleFederationPluginOptions,
): Parameters<typeof init>[0] {
  const remotes = buildOptions.remotes || {};
  const runtimeRemotes = Object.entries(remotes).map((remote) => {
    const [_alias, nameAndEntry] = remote;
    const [name, entry] = (nameAndEntry as string).split('@');
    return { name, entry };
  });

  return {
    name: buildOptions.name!,
    remotes: runtimeRemotes,
  };
}

export const moduleFederationDataLoaderPlugin = (
  enable: boolean,
  internalOptions: InternalModernPluginOptions,
  userConfig: DataLoaderOptions,
): CliPlugin<AppTools> => ({
  name: '@modern-js/plugin-module-federation-data-loader',
  pre: ['@modern-js/plugin-module-federation-config'],
  post: ['@modern-js/plugin-router', '@modern-js/plugin-module-federation'],
  setup: async ({ useConfigContext, useAppContext }) => {
    if (!enable) {
      return;
    }
    const {
      baseName,
      partialSSRRemotes = [],
      fetchSSRByRouteIds,
      patchMFConfig,
      metaName = META_NAME,
      serverPlugin = '@module-federation/modern-js/data-loader-server',
      transformRuntimeOptions,
    } = userConfig;

    if (!baseName) {
      throw new Error(
        `${PLUGIN_IDENTIFIER} 'baseName' is required if you enable 'dataLoader'!`,
      );
    }
    const modernjsConfig = useConfigContext();
    const appContext = useAppContext();

    const enableSSR = Boolean(modernjsConfig?.server?.ssr);
    const name = internalOptions.csrConfig?.name!;
    //TODO: 区分多入口、区分 server/client routes
    const routesFilePath = path.resolve(
      appContext.internalDirectory.replace(META_NAME, metaName || META_NAME),
      `./main/${MODERN_JS_FILE_SYSTEM_ROUTES_FILE_NAME}`,
    );

    const transformRuntimeFn =
      transformRuntimeOptions || _transformRuntimeOptions;
    return {
      _internalRuntimePlugins: ({ entrypoint, plugins }) => {
        plugins.push({
          name: 'ssrDataLoader',
          path: '@module-federation/modern-js/data-loader',
          config: {},
        });
        return { entrypoint, plugins };
      },
      _internalServerPlugins({ plugins }) {
        plugins.push({
          name: serverPlugin,
          options: transformRuntimeFn(internalOptions.csrConfig!),
        });

        return { plugins };
      },
      config: async () => {
        const fetchFn = fetchSSRByRouteIds || _fetchSSRByRouteIds;
        const ssrByRouteIds = await fetchFn(
          partialSSRRemotes,
          internalOptions.csrConfig!,
          transformRuntimeFn,
        );
        const patchMFConfigFn = patchMFConfig || _pathMfConfig;

        return {
          server: {
            ssrByRouteIds: ssrByRouteIds,
          },
          tools: {
            rspack(_config, { isServer }) {
              patchMFConfigFn({
                mfConfig: isServer
                  ? internalOptions.ssrConfig!
                  : internalOptions.csrConfig!,
                baseName,
                metaName,
                isServer,
                routesFilePath,
              });
            },
            webpack(_config, { isServer }) {
              patchMFConfigFn({
                mfConfig: isServer
                  ? internalOptions.ssrConfig!
                  : internalOptions.csrConfig!,
                baseName,
                metaName,
                isServer,
                routesFilePath,
              });
            },
            bundlerChain(chain, { isServer }) {
              if (
                !isServer &&
                internalOptions.csrConfig &&
                Object.keys(
                  internalOptions.csrConfig.exposes as Record<string, string>,
                ).length
              ) {
                chain
                  .plugin('SerializableRoutesPlugin')
                  .use(SerializableRoutesPlugin, [
                    {
                      routesFilePath,
                      prefix: transformName2Prefix(
                        internalOptions.csrConfig.name!,
                      ),
                    },
                  ]);
              }
            },
          },
          source: {
            define: {
              MODERN_ROUTER_ID_PREFIX: JSON.stringify(
                transformName2Prefix(name),
              ),
            },
          },
        };
      },
    };
  },
});

export default moduleFederationDataLoaderPlugin;

export { generateRoutes, generateSlimRoutes };
