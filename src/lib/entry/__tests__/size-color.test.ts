import { sizeColorFor } from "../size-color";

describe("sizeColorFor", () => {
  it("matches the DS/ANX/05 color-code chart for the base 6–26Fr run", () => {
    expect(sizeColorFor("6")?.name).toBe("Brown");
    expect(sizeColorFor("8")?.name).toBe("Black");
    expect(sizeColorFor("10")?.name).toBe("Ash Grey");
    expect(sizeColorFor("12")?.name).toBe("White");
    expect(sizeColorFor("14")?.name).toBe("Green");
    expect(sizeColorFor("16")?.name).toBe("Orange");
    expect(sizeColorFor("18")?.name).toBe("Red");
    expect(sizeColorFor("20")?.name).toBe("Yellow");
    expect(sizeColorFor("22")?.name).toBe("Violet");
    expect(sizeColorFor("24")?.name).toBe("Dark Blue");
    expect(sizeColorFor("26")?.name).toBe("Pink");
  });

  it("repeats the cycle past 26Fr, same as the chart", () => {
    expect(sizeColorFor("28")?.name).toBe("Brown");
    expect(sizeColorFor("30")?.name).toBe("Black");
  });

  it("accepts any size spelling", () => {
    expect(sizeColorFor("14Fr")?.name).toBe("Green");
    expect(sizeColorFor("Fr14")?.name).toBe("Green");
    expect(sizeColorFor(14)?.name).toBe("Green");
  });

  it("is null for unparseable or out-of-range sizes", () => {
    expect(sizeColorFor(null)).toBeNull();
    expect(sizeColorFor(undefined)).toBeNull();
    expect(sizeColorFor("")).toBeNull();
    expect(sizeColorFor("odd-13")).toBeNull(); // odd FR sizes aren't on the chart
    expect(sizeColorFor("4")).toBeNull(); // below the chart's 6Fr floor
  });
});
