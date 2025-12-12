export const getText = (isLong: boolean, level: number) => {
    let breakDirection = isLong ? "above" : "below";
    let direction = isLong ? "up" : "down";
    let reverseDirection = isLong ? "down" : "up";
    if (level < 0) {
        return "";
    }
    let text = `
    Level to add is ${level}.
    There are 3 scenarios when price come to level to add: 
    1. Price breaks ${breakDirection} the level and then makes a mini pullback and continue going ${direction}.
    2. Price breaks ${breakDirection} the level and makes a reversal pattern from the level and going back ${reverseDirection}.
    3. Price gets above and below the level multiple times and being choppy around the level.

    If we added when price breaks ${breakDirection} the level, we move the stop for the adds and more partials to the level to add. 
    If we stop out on those, don't add for this level any more because it can just be choppy for this level.
    `;
    return text;
}