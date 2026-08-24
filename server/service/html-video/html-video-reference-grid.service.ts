export type HtmlVideoReferenceGridRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Keeps the repeated visual cells in a board/grid and removes geometry outliers
 * such as page titles, publisher marks and watermarks. It only activates when
 * enough reliable regions exist; short or unstructured lists are left intact.
 */
export function filterRepeatedReferenceGridItems<T>(
  items: T[],
  regionOf: (item: T) => HtmlVideoReferenceGridRegion | undefined
) {
  if (items.length < 6) return items;

  const measured = items.flatMap((item) => {
    const region = regionOf(item);
    if (!region || region.width <= 0 || region.height <= 0) return [];
    return [{ item, region, area: region.width * region.height }];
  });
  if (measured.length < Math.max(6, Math.ceil(items.length * 0.65))) return items;

  const medianHeight = median(measured.map(({ region }) => region.height));
  const medianArea = median(measured.map(({ area }) => area));
  if (medianHeight <= 0 || medianArea <= 0) return items;

  const inlierItems = new Set(measured.filter(({ region, area }) => (
    region.height >= medianHeight * 0.58 &&
    region.height <= medianHeight * 1.75 &&
    area >= medianArea * 0.35 &&
    area <= medianArea * 2.8
  )).map(({ item }) => item));
  const minimumInliers = Math.max(6, Math.ceil(items.length * 0.7));
  if (inlierItems.size < minimumInliers || inlierItems.size === items.length) return items;

  return items.filter((item) => inlierItems.has(item));
}
