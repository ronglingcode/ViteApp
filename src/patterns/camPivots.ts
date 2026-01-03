import * as Models from '../models/models';
export const getPatterns = (symbol: string) => {
    let symbolData = Models.getSymbolData(symbol);
    let camPivots = symbolData.camPivots;
    let patternsForOpenPrice = "";
    let openPrice = Models.getOpenPrice(symbol);
    let currentPrice = Models.getCurrentPrice(symbol);
    if (openPrice) {
        patternsForOpenPrice = getPatternsForPrice(camPivots, openPrice);
    }
    let patternsForCurrentPrice = getPatternsForPrice(camPivots, currentPrice);
    return {
        patternsForOpenPrice: patternsForOpenPrice,
        patternsForCurrentPrice: patternsForCurrentPrice
    }
}
export const getPatternsForPrice = (pivots: Models.CamarillaPivots, price: number) => {
    let nearPercentage = 0.2;
    if (price > pivots.R6) {
        return "above R6";
    } else if (price > pivots.R5) {
        let distance = pivots.R6 - pivots.R5;
        if (price > pivots.R6-nearPercentage*distance) {
            return "near below R6";
        } else if (price < pivots.R5+nearPercentage*distance) {
            return "near above R5";
        } else {
            return "between R5 and R6";
        }

    } else if (price > pivots.R4) {
        let distance = pivots.R5 - pivots.R4;
        if (price > pivots.R5-nearPercentage*distance) {
            return "near below R5";
        } else if (price < pivots.R4+nearPercentage*distance) {
            return "near above R4";
        } else {
            return "between R4 and R5";
        }
    } else if (price > pivots.R3) {
        let distance = pivots.R4 - pivots.R3;
        if (price > pivots.R4-nearPercentage*distance) {
            return "near below R4";
        } else if (price < pivots.R3+nearPercentage*distance) {
            return "near above R3";
        } else {
            return "between R3 and R4";
        }
    } else if (price > pivots.R2) {
        let distance = pivots.R3 - pivots.R2;
        if (price > pivots.R3-nearPercentage*distance) {
            return "near below R3";
        } else if (price < pivots.R2+nearPercentage*distance) {
            return "near above R2";
        } else {
            return "between R2 and R3";
        }
    } else if (price > pivots.R1) {
        let distance = pivots.R2 - pivots.R1;
        if (price > pivots.R2-nearPercentage*distance) {
            return "near below R2";
        } else if (price < pivots.R1+nearPercentage*distance) {
            return "near above R1";
        } else {
            return "between R1 and R2";
        }
    } else if (price > pivots.S4) {
        let distance = pivots.R1 - pivots.S4;
        if (price > pivots.R1-nearPercentage*distance) {
            return "near below R1";
        } else if (price < pivots.S4+nearPercentage*distance) {
            return "near above S4";
        } else {
            return "between S4 and R1";
        }
    } else if (price > pivots.S3) {
        let distance = pivots.S4 - pivots.S3;
        if (price > pivots.S4-nearPercentage*distance) {
            return "near below S4";
        } else if (price < pivots.S3+nearPercentage*distance) {
            return "near above S3";
        } else {
            return "between S3 and S4";
        }
    } else if (price > pivots.S2) {
        let distance = pivots.S3 - pivots.S2;
        if (price > pivots.S3-nearPercentage*distance) {
            return "near below S3";
        } else if (price < pivots.S2+nearPercentage*distance) {
            return "near above S2";
        } else {
            return "between S2 and S3";
        }
    } else if (price > pivots.S1) {
        let distance = pivots.S2 - pivots.S1;
        if (price > pivots.S2-nearPercentage*distance) {
            return "near below S2";
        } else if (price < pivots.S1+nearPercentage*distance) {
            return "near above S1";
        } else {
            return "between S1 and S2";
        }
    } else if (price > pivots.S5) {
        let distance = pivots.S6 - pivots.S5;
        if (price > pivots.S6-nearPercentage*distance) {
            return "near below S6";
        } else if (price < pivots.S5+nearPercentage*distance) {
            return "near above S5";
        } else {
            return "between S5 and S6";
        }
    } else if (price > pivots.S6) {
        return "below S6";
    } else {
        return "below S6";
    }
}
