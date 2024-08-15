import type { ServerPlugin } from '@modern-js/server-core';
import {
  getInstance,
  init,
  type FederationHost,
} from '@module-federation/enhanced/runtime';
import { MF_SLIM_ROUTES } from '../../runtime/constant';
import type { RouteObject } from '@modern-js/runtime/router';

type MFRuntimeOptions = Parameters<typeof init>[0];

async function getSlimRemotes(mfInstance: FederationHost) {
  return await Promise.all(
    mfInstance.options.remotes.map(async (remote) => {
      const { routes, baseName } = (await mfInstance.loadRemote(
        `${remote.name}/${MF_SLIM_ROUTES}`,
      )) as { baseName: string; routes: RouteObject[] };
      return { routes, baseName };
    }),
  );
}

export default (mfRuntimeOptions: MFRuntimeOptions): ServerPlugin => ({
  name: 'MFDataLoaderServerPlugin',
  pre: ['@modern-js/plugin-inject-resource'],
  setup(api) {
    const { remotes, name } = mfRuntimeOptions;
    if (!remotes.length) {
      return {};
    }
    let isHandled = false;
    return {
      prepare() {
        const { middlewares } = api.useAppContext();
        middlewares.push({
          name: 'MFDataLoaderServerPlugin',
          handler: async (c, next) => {
            console.log('isHandled : ', isHandled);
            const serverManifest = c.get('serverManifest');
            const { loaderBundles, nestedRoutesJson } = serverManifest;
            console.log('nestedRoutesJson: ', nestedRoutesJson);
            console.log(
              'loaderBundles.main.routes : ',
              loaderBundles.main.routes,
            );
            if (isHandled) {
              await next();
            } else {
              const instance =
                getInstance() ||
                init({
                  name: name,
                  remotes,
                });
              const slimRoutes = await getSlimRemotes(instance);
              slimRoutes.forEach((slimRoute) => {
                const { routes, baseName } = slimRoute;
                //TODO: 后续从消费者路由获取
                routes[0].path = `/${baseName}`;
                loaderBundles.main.routes.push(...routes);
                nestedRoutesJson.default.main.push(...routes);
              });

              console.log('push loaderBundles.main.routes done ');
              isHandled = true;
              await next();
            }
          },
          before: ['render'],
        });
      },
    };
  },
});
