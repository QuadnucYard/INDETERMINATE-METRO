/**
 * RGB color representation. Each component ranges from 0 to 255.
 */
export class Rgb {
  constructor(
    public r: number,
    public g: number,
    public b: number,
  ) {}

  public static fromHex(hex: string): Rgb {
    const h = parseInt(hex.replace("#", ""), 16);
    return new Rgb((h >> 16) & 255, (h >> 8) & 255, h & 255);
  }

  public withAlpha(a: number): Rgba {
    return new Rgba(this.r, this.g, this.b, a);
  }

  public toHex(): string {
    const hex = (((this.r & 0xff) << 16) | ((this.g & 0xff) << 8) | (this.b & 0xff))
      .toString(16)
      .padStart(6, "0");
    return `#${hex}`;
  }

  public toCss(): string {
    return `rgba(${this.r}, ${this.g}, ${this.b})`;
  }
}

/**
 * RGBA color representation. Each component ranges from 0 to 255, alpha from 0 to 1.
 */
export class Rgba {
  constructor(
    public r: number,
    public g: number,
    public b: number,
    /** Opacity, in [0, 1] */
    public a: number,
  ) {}

  public toCss(): string {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
  }
}
