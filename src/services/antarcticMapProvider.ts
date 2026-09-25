import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { Style, Fill, Stroke, Text } from 'ol/style';
import { transform } from 'ol/proj';

export type BasemapSourceType = 'BAS_ANTARCTIC' | 'NASA_GIBS_WMTS' | 'OFFLINE_VECTOR';

export interface BasemapProviderConfig {
  sourceType: BasemapSourceType;
}

/**
 * Tile Load Handler: converts black/white no-data tile margins to the
 * continuous Southern Ocean background color (#DCEAF0 = rgb(220, 234, 240)).
 *
 * This prevents NASA GIBS JPEG black corners or ESRI/BAS white tile margins
 * from rendering as a visual polar circle inside the rectangular viewport.
 */
function applyTileNoDataCleaning(source: XYZ, oceanRGB: [number, number, number] = [220, 234, 240]) {
  source.setTileLoadFunction((tile, src) => {
    const img = (tile as any).getImage() as HTMLImageElement;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth || 256;
        const h = img.naturalHeight || 256;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        let modified = false;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          // GIBS JPEG out-of-bounds pixels are black (r<18, g<18, b<18)
          // Out-of-bounds white margins are (r>252, g>252, b>252)
          if ((r < 18 && g < 18 && b < 18) || (r > 252 && g > 252 && b > 252)) {
            d[i] = oceanRGB[0];
            d[i + 1] = oceanRGB[1];
            d[i + 2] = oceanRGB[2];
            d[i + 3] = 255;
            modified = true;
          }
        }
        if (modified) {
          ctx.putImageData(imgData, 0, 0);
          img.src = canvas.toDataURL();
        }
      } catch (e) {
        // Fall back gracefully if canvas manipulation is restricted
      }
    };
    img.src = src;
  });
}

/**
 * AntarcticMapProvider
 *
 * Abstraction for Antarctic basemap tiles in EPSG:3031.
 *
 * Online:  BAS Antarctic & Southern Ocean basemap (real tile service)
 * Fallback: NASA GIBS Blue Marble
 * Offline: Vector drawing mode (real geographic vectors, NO circular mask)
 */
export class AntarcticMapProvider {
  private config: BasemapProviderConfig;

  constructor(config: BasemapProviderConfig = { sourceType: 'BAS_ANTARCTIC' }) {
    this.config = config;
  }

  public setSourceType(sourceType: BasemapSourceType) {
    this.config.sourceType = sourceType;
  }

  public getSourceType(): BasemapSourceType {
    return this.config.sourceType;
  }

  /**
   * Creates the primary basemap layer in native EPSG:3031.
   */
  public createBasemapLayer(): TileLayer<XYZ> | VectorLayer<VectorSource> {
    if (this.config.sourceType === 'BAS_ANTARCTIC') {
      return this.createBASLayer();
    }

    if (this.config.sourceType === 'NASA_GIBS_WMTS') {
      return this.createNASAGIBSLayer();
    }

    return this.createOfflineVectorLayer();
  }

  // ─── BAS Antarctic & Southern Ocean (Official Tile Service) ────────────────
  private createBASLayer(): TileLayer<XYZ> {
    const origin: [number, number] = [-30635955.4472718, 30635955.4472718];
    const resolutions = [
      239343.40193181095, // Level 0
      119671.70096590547, // Level 1
      59835.85048295274,  // Level 2
      29917.92524147637,  // Level 3
      14958.962620738184, // Level 4
       7479.481310369092, // Level 5
       3739.740655184546, // Level 6
       1869.870327592273, // Level 7
        934.9351637961365, // Level 8
    ];

    const basTileGrid = new TileGrid({
      origin,
      resolutions,
      tileSize: [256, 256],
      extent: [-4898635.244666592, -4898635.24466659, 4898635.24466659, 4898635.244666592],
    });

    const source = new XYZ({
      url: 'https://tiles.arcgis.com/tiles/tPxy1hrFDhJfZ0Mf/arcgis/rest/services/Antarctica_and_the_Southern_Ocean/MapServer/tile/{z}/{y}/{x}',
      projection: 'EPSG:3031',
      tileGrid: basTileGrid,
      crossOrigin: 'anonymous',
    });

    applyTileNoDataCleaning(source);

    return new TileLayer({
      source,
      zIndex: 1,
    });
  }

  // ─── NASA GIBS BlueMarble Shaded Relief Bathymetry in EPSG:3031 ──────────────
  private createNASAGIBSLayer(): TileLayer<XYZ> {
    const origin: [number, number] = [-4194304, 4194304];
    const resolutions = [8192, 4096, 2048, 1024, 512]; // EXACTLY 5 levels: TileMatrix 0-4

    const gibsTileGrid = new TileGrid({
      origin,
      resolutions,
      tileSize: [512, 512],
      extent: [-4194304, -4194304, 4194304, 4194304],
    });

    const source = new XYZ({
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3031/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg',
      projection: 'EPSG:3031',
      tileGrid: gibsTileGrid,
      crossOrigin: 'anonymous',
    });

    applyTileNoDataCleaning(source);

    return new TileLayer({
      source,
      zIndex: 1,
    });
  }

  // ─── Offline Mission Vector Layer (No circular ocean disk, real geography) ──
  private createOfflineVectorLayer(): VectorLayer<VectorSource> {
    const source = new VectorSource();
    const to3031 = (lon: number, lat: number) =>
      transform([lon, lat], 'EPSG:4326', 'EPSG:3031') as [number, number];

    // 1. Antarctic Continent Landmass (Detailed coastline polygon in EPSG:4326 -> 3031)
    const antarcticPoints: [number, number][] = [
      [-63.8, -63.3], [-57.0, -63.5], [-55.5, -66.0], [-60.0, -68.5],
      [-65.0, -68.0], [-70.0, -71.5], [-75.0, -74.0], [-80.0, -78.0],
      [-90.0, -74.0], [-105.0, -74.5], [-120.0, -74.0], [-135.0, -75.0],
      [-150.0, -76.5], [-165.0, -77.5], [-180.0, -78.0], [165.0, -77.0],
      [150.0, -69.0], [135.0, -66.5], [120.0, -66.8], [105.0, -66.0],
      [90.0, -66.5], [75.0, -69.0], [60.0, -67.5], [45.0, -67.8],
      [30.0, -70.0], [15.0, -70.2], [0.0, -70.0], [-15.0, -72.0],
      [-30.0, -75.0], [-45.0, -77.5], [-60.0, -75.5], [-63.8, -63.3],
    ];
    const contPoly = antarcticPoints.map(([lon, lat]) => to3031(lon, lat));
    const landFeat = new Feature({ geometry: new Polygon([contPoly]) });
    landFeat.setStyle(
      new Style({
        fill: new Fill({ color: 'rgba(255, 255, 255, 0.96)' }),
        stroke: new Stroke({ color: '#0284C7', width: 1.8 }),
      })
    );
    source.addFeature(landFeat);

    // 2. Major Ice Shelves (Ronne-Filchner & Ross)
    const ronneIceShelf: [number, number][] = [
      [-60.0, -75.5], [-45.0, -77.5], [-30.0, -75.0], [-50.0, -82.0], [-80.0, -78.0], [-60.0, -75.5]
    ];
    const rFeat = new Feature({ geometry: new Polygon([ronneIceShelf.map(([lon, lat]) => to3031(lon, lat))]) });
    rFeat.setStyle(new Style({ fill: new Fill({ color: 'rgba(224, 242, 254, 0.70)' }), stroke: new Stroke({ color: '#38BDF8', width: 1.2, lineDash: [4, 4] }) }));
    source.addFeature(rFeat);

    const rossIceShelf: [number, number][] = [
      [-165.0, -77.5], [165.0, -77.0], [175.0, -84.0], [-155.0, -84.0], [-165.0, -77.5]
    ];
    const rossFeat = new Feature({ geometry: new Polygon([rossIceShelf.map(([lon, lat]) => to3031(lon, lat))]) });
    rossFeat.setStyle(new Style({ fill: new Fill({ color: 'rgba(224, 242, 254, 0.70)' }), stroke: new Stroke({ color: '#38BDF8', width: 1.2, lineDash: [4, 4] }) }));
    source.addFeature(rossFeat);

    // 3. Research Stations & Labels
    const stations = [
      { name: 'SOUTH POLE (Amundsen-Scott)', lat: -90, lon: 0, color: '#EF4444' },
      { name: 'Palmer Station (US)', lat: -64.77, lon: -64.05, color: '#0284C7' },
      { name: 'Rothera Station (UK)', lat: -67.57, lon: -68.13, color: '#0284C7' },
      { name: 'McMurdo Station (US)', lat: -77.85, lon: 166.67, color: '#0284C7' },
      { name: 'Mawson Station (AU)', lat: -67.60, lon: 62.87, color: '#0284C7' },
      { name: 'Davis Station (AU)', lat: -68.58, lon: 77.97, color: '#0284C7' },
      { name: 'Casey Station (AU)', lat: -66.28, lon: 110.53, color: '#0284C7' },
    ];

    stations.forEach((st) => {
      const f = new Feature({ geometry: new Point(to3031(st.lon, st.lat)) });
      f.setStyle(
        new Style({
          text: new Text({
            text: `★ ${st.name}`,
            font: 'bold 9px "JetBrains Mono", monospace',
            fill: new Fill({ color: st.color }),
            stroke: new Stroke({ color: '#FFFFFF', width: 2.5 }),
            offsetY: st.lat === -90 ? -12 : -8,
          }),
        })
      );
      source.addFeature(f);
    });

    // 4. Geographic Seas Labels
    const seas = [
      { name: 'WEDDELL SEA', lat: -72, lon: -45 },
      { name: 'ROSS SEA', lat: -75, lon: 175 },
      { name: 'AMUNDSEN SEA', lat: -72, lon: -115 },
      { name: 'BELLINGSHAUSEN SEA', lat: -70, lon: -85 },
      { name: 'DAVIS SEA', lat: -66, lon: 92 },
    ];

    seas.forEach((sea) => {
      const f = new Feature({ geometry: new Point(to3031(sea.lon, sea.lat)) });
      f.setStyle(
        new Style({
          text: new Text({
            text: sea.name,
            font: 'bold 10px "Inter", sans-serif',
            fill: new Fill({ color: 'rgba(3, 105, 161, 0.70)' }),
            stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.85)', width: 2 }),
          }),
        })
      );
      source.addFeature(f);
    });

    return new VectorLayer({ source, zIndex: 1 });
  }
}

