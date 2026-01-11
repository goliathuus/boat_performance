import type * as L from 'leaflet';

declare module 'leaflet' {
  namespace L {
    interface HotlineOptions {
      min?: number;
      max?: number;
      palette?: Record<number, string>;
      weight?: number;
      outlineColor?: string;
      outlineWidth?: number;
      opacity?: number;
    }

    class Hotline extends L.Layer {
      constructor(latlngs: Array<[number, number, number]>, options?: HotlineOptions);
      setLatLngs(latlngs: Array<[number, number, number]>): this;
      setOptions(options: HotlineOptions): this;
    }

    function hotline(latlngs: Array<[number, number, number]>, options?: HotlineOptions): Hotline;
  }
}

declare module 'leaflet-hotline/dist/leaflet.hotline' {
  const plugin: any;
  export default plugin;
}
