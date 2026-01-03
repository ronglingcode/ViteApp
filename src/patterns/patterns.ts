import * as AllTimeHigh from './allTimeHigh';
import * as CamPivots from './camPivots';
export const analyzePatterns = (symbol: string) => {
    let allTimeHigh = AllTimeHigh.getPatterns(symbol);
    let camPivots = CamPivots.getPatterns(symbol);
    return {
        allTimeHigh: allTimeHigh,
        camPivots: camPivots
    }
}