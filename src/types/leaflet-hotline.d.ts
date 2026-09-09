// Le bundle leaflet-hotline est un UMD sans typings : on declare seulement le
// module pour que l'import a effet de bord compile. L'API est utilisee via
// `(L as any).hotline(...)` dans HotlineTrack, avec un type local HotlineLayer.
declare module 'leaflet-hotline/dist/leaflet.hotline' {
  const plugin: unknown;
  export default plugin;
}
