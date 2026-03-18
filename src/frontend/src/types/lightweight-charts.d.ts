declare module "lightweight-charts" {
  export const ColorType: { Solid: string; VerticalGradient: string };
  export const CrosshairMode: { Normal: number; Magnet: number };
  export interface IChartApi {
    addSeries(seriesType: any, options?: any): ISeriesApi<string>;
    priceScale(id: string): { applyOptions(opts: any): void };
    timeScale(): { fitContent(): void; applyOptions(opts: any): void };
    applyOptions(opts: any): void;
    remove(): void;
  }
  // biome-ignore lint/suspicious/noExplicitAny: shim
  export interface ISeriesApi<_T> {
    setData(data: any[]): void;
    applyOptions(opts: any): void;
  }
  export function createChart(container: HTMLElement, options?: any): IChartApi;
  export const CandlestickSeries: any;
  export const HistogramSeries: any;
  export const LineSeries: any;
  export const AreaSeries: any;
  export const BarSeries: any;
  export const BaselineSeries: any;
}
