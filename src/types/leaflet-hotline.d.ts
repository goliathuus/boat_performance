declare module 'leaflet-hotline' {
  import * as L from 'leaflet';

  namespace hotline {
    interface HotlineOptions {
      min: number;
      max: number;
      palette: Record<number, string>;
      weight?: number;
      outlineColor?: string;
      outlineWidth?: number;
      opacity?: number;
    }
  }

  declare module 'leaflet' {
    namespace L {
      function hotline(
        positions: Array<[number, number, number]>,
        options: hotline.HotlineOptions
      ): Hotline;

      class Hotline extends Path {
        setLatLngs(latlngs: Array<[number, number, number]>): this;
        setOptions(options: hotline.HotlineOptions): this;
      }
    }
  }
}


