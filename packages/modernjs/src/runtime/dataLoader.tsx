import type { Plugin } from '@modern-js/runtime';
import { type RouteObject } from '@modern-js/runtime/router';
import { getInstance, loadRemote } from '@module-federation/enhanced/runtime';
import { MF_FULL_ROUTES } from './constant';

declare global {
  var mfRemoteRoutes: RouteObject[];
  var mfHasLoadedRemoteRoutes: boolean;
}

globalThis.mfRemoteRoutes = globalThis.mfRemoteRoutes || [];
globalThis.mfHasLoadedRemoteRoutes =
  globalThis.mfHasLoadedRemoteRoutes ?? false;

async function loadRoutes() {
  if (globalThis.mfHasLoadedRemoteRoutes) {
    return;
  }
  const remotes = getInstance()?.options.remotes;
  if (!remotes) {
    return;
  }
  const remoteModuleIds = remotes.map((remote) => {
    return `${remote.name}/${MF_FULL_ROUTES}`;
  });

  const traverse = (cRoutes: RouteObject[], prefix: string) => {
    cRoutes.forEach((i) => {
      i.id = prefix + i.id;
      // @ts-ignore
      const Comp = i.component;
      i.element = <Comp />;
      if (i.children) {
        traverse(i.children, prefix);
      }
    });
  };

  await Promise.all(
    remoteModuleIds.map(async (remoteModuleId) => {
      const remoteName = remoteModuleId.split(`/${MF_FULL_ROUTES}`)[0];
      const { routes, baseName } = (await loadRemote(remoteModuleId)) as {
        routes: RouteObject[];
        baseName: string;
      };
      routes[0].path = `/${baseName}`;
      // @ts-ignore
      routes[0].isRoot = false;
      globalThis.mfRemoteRoutes.push(...routes);
    }),
  );
  globalThis.mfHasLoadedRemoteRoutes = true;
  return globalThis.mfRemoteRoutes;
}

export const ssrDataLoaderPlugin = (): Plugin => {
  return {
    name: '@modern-js/plugin-mf-data-loader',
    post: ['@modern-js/plugin-router'],
    setup: () => {
      return {
        async beforeRender({ context }) {
          console.log('init');

          // if (typeof window === 'undefined') {
          //   console.log(context.ssrContext?.request.pathname);
          // } else {
          //   console.log(location.pathname);
          // }
          await loadRoutes();
        },
        modifyRoutes: (routes: RouteObject[]) => {
          console.log('modifyRoutes');
          routes.push(...globalThis.mfRemoteRoutes);
          console.log('routes: ', routes);
          return routes;
        },
      };
    },
  };
};
