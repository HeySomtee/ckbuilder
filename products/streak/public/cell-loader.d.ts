export type CellLoaderVariant = 'orbit' | 'wave';
export function cellLoaderMarkup(variant?: CellLoaderVariant): string;
export function registerCellLoader(svg: SVGSVGElement): () => void;
export function observeCellLoaders(root: Element): () => void;
