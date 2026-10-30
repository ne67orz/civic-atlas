import { bounded } from "./core";
import { readFigure } from "../../shared/figure";
export const lookupFigure = (name: string) => readFigure(name, bounded);
