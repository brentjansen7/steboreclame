declare module "perspectivejs" {
  export default class Perspective {
    constructor(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement | HTMLImageElement);
    draw(points: [number, number][]): void;
  }
}
