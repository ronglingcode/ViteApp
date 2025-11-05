import * as webRequest from '../../utils/webRequest';
import * as Firestore from '../../firestore';
import type * as Models from '../../models/models';

declare let window: Models.MyWindow;

export interface GoogleDocsConfig {
    documentId: string;
}

export interface StockGrading {
    symbol: string;
    hasFreshNews: string;
    volumeAndSpread: string;
    chartStructure: string;
    aPlusConditions: string;
    setupQuality: string;
    selected: string;
}

export interface DetailedPlan {
    symbol: string;
    keyLevels: string;
    notes: string;
}

export const getGoogleDocsConfig = (): GoogleDocsConfig => {
    let config = localStorage.getItem('tradingscripts.googleDocs');
    if (config == null) {
        console.error('no Google Docs configuration in local storage');
        return {
            documentId: ''
        };
    }

    let data = JSON.parse(config);
    return {
        documentId: data.documentId
    };
};

export const fetchDocumentContent = async (documentId: string): Promise<string> => {
    // Use Google Docs export API for public documents
    // This works for documents set to "Anyone with the link can view"
    const url = `https://docs.google.com/document/d/${documentId}/export?format=txt`;

    const response = await webRequest.asyncGetWithoutToken(url);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch public document: ${response.status} - ${errorText}`);
    }

    const content = await response.text();
    return content;
};
export const parseGoogleDoc = (content: string): { gradingList: StockGrading[], detailedPlans: DetailedPlan[], bestIdeas: Map<string, string[]> } => {
    const gradingList = parseInitialGradingList(content);
    const detailedPlans = parseDetailedPlans(content);
    const bestIdeas = parseBestIdeas(content);
    return { gradingList, detailedPlans, bestIdeas };
};

export const parseInitialGradingList = (content: string): StockGrading[] => {
    try {
        // Find the section between "Initial Grading List" and "Best ideas"
        const startMarker = "Initial Grading List";
        const endMarker = "A+ potentials";

        const startIndex = content.indexOf(startMarker);
        const endIndex = content.indexOf(endMarker);

        if (startIndex === -1 || endIndex === -1) {
            throw new Error('Could not find "Initial Grading List" or "Best ideas" markers');
        }

        if (startIndex >= endIndex) {
            throw new Error('Invalid section: "Initial Grading List" appears after "Best ideas"');
        }

        // Extract the table section
        const tableSection = content.substring(startIndex + startMarker.length, endIndex).trim();

        // Parse using tab-delimited format (Google Docs table export)
        const gradingList = parseInitialGradingListTable(tableSection);
        return gradingList;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Firestore.logError(`Error parsing Initial Grading List: ${errorMessage}`);
        throw error;
    }
};
export const parseBestIdeas = (content: string): Map<string, string[]> => {
    try {
        // Find the section between "A+ potentials" and "Detailed Plans"
        const startMarker = "A+ potentials";
        const endMarker = "Detailed Plans";

        const startIndex = content.indexOf(startMarker);
        const endIndex = content.indexOf(endMarker);

        if (startIndex === -1 || endIndex === -1) {
            throw new Error(`Could not find ${startMarker} or ${endMarker} markers`);
        }

        if (startIndex >= endIndex) {
            throw new Error(`Invalid section: "${startMarker}" appears after "${endMarker}"`);
        }

        // Extract the table section
        const sectionContent = content.substring(startIndex + startMarker.length, endIndex).trim();
        const plans = parseBulletListTradingPlans(sectionContent);

        return plans;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Firestore.logError(`Error parsing A+ potentials: ${errorMessage}`);
        throw error;
    }
}
export const parseDetailedPlans = (content: string): DetailedPlan[] => {
    try {
        // Find the section between "Initial Grading List" and "Best ideas"
        const startMarker = "Detailed Plans";
        const endMarker = "TRADE 1:";

        const startIndex = content.indexOf(startMarker);
        const endIndex = content.indexOf(endMarker);

        if (startIndex === -1 || endIndex === -1) {
            throw new Error('Could not find "Detailed Plans" or "TRADE 1:" markers');
        }

        if (startIndex >= endIndex) {
            throw new Error('Invalid section: "Detailed Plans" appears after "TRADE 1:"');
        }

        // Extract the table section
        const tableSection = content.substring(startIndex + startMarker.length, endIndex).trim();

        const detailedPlans = parseDetailedPlansTable(tableSection);

        return detailedPlans;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Firestore.logError(`Error parsing Detailed Plans: ${errorMessage}`);
        throw error;
    }
};

const parseDetailedPlansTable = (content: string): DetailedPlan[] => {
    const plans: DetailedPlan[] = [];
    const cells = content.split('\t');
    const numberOfColumns = 3;
    const numberOfRows = cells.length / numberOfColumns;
    // Skip header row
    for (let row = 1; row < numberOfRows; row++) {
        let plan: DetailedPlan = {
            symbol: cells[row * numberOfColumns].trim(),
            keyLevels: cells[row * numberOfColumns + 1].trim(),
            notes: cells[row * numberOfColumns + 2].trim()
        };
        if (plan.symbol) {
            plans.push(plan);
        }
    }
    return plans;
};

const parseInitialGradingListTable = (tableSection: string): StockGrading[] => {
    const stocks: StockGrading[] = [];
    const cells = tableSection.split('\t');
    const numberOfColumns = 7;
    const numberOfRows = cells.length / numberOfColumns;

    // Skip header row
    for (let row = 1; row < numberOfRows; row++) {
        let stock: StockGrading = {
            symbol: cells[row * numberOfColumns].trim(),
            hasFreshNews: cells[row * numberOfColumns + 1].trim(),
            volumeAndSpread: cells[row * numberOfColumns + 2].trim(),
            chartStructure: cells[row * numberOfColumns + 3].trim(),
            aPlusConditions: cells[row * numberOfColumns + 4].trim(),
            setupQuality: cells[row * numberOfColumns + 5].trim(),
            selected: cells[row * numberOfColumns + 6].trim()
        };
        if (stock.symbol) {
            stocks.push(stock);
        }
    }

    return stocks;
};

/**
 * Parses a bullet list format into structured trading plans
 * Format: 
 * 1. SYMBOL
 *    1. Strategy description
 *    2. Another strategy description
 * 2. ANOTHER_SYMBOL
 *    1. Strategy description
 */
export const parseBulletListTradingPlans = (content: string): Map<string, string[]> => {
    const plans: Map<string, string[]> = new Map();
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    let currentSymbol: string | null = null;
    let currentStrategies: string[] = [];

    for (const line of lines) {
        // Check if this is a first-level bullet (symbol)
        const symbolMatch = line.match(/^\d+\.\s+([A-Z]+)$/);
        if (symbolMatch) {
            // Save previous symbol if exists
            if (currentSymbol && currentStrategies.length > 0) {
                plans.set(currentSymbol, [...currentStrategies]);
            }

            // Start new symbol
            currentSymbol = symbolMatch[1];
            currentStrategies = [];
            continue;
        }

        // Check if this is a second-level bullet (strategy)
        const strategyMatch = line.match(/^\d+\.\s+(.+)$/);
        if (strategyMatch && currentSymbol) {
            currentStrategies.push(strategyMatch[1].trim());
        }
    }

    // Don't forget the last symbol
    if (currentSymbol && currentStrategies.length > 0) {
        plans.set(currentSymbol, [...currentStrategies]);
    }

    return plans;
};

// Debug function to show the actual delimiters in the content
export const debugTableStructure = (content: string): string => {
    const startMarker = "Initial Grading List";
    const endMarker = "Best ideas";

    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
        console.log('Markers not found');
        return '';
    }

    const tableSection = content.substring(startIndex + startMarker.length, endIndex).trim();
    const lines = tableSection.split('\n');

    console.log('=== TABLE STRUCTURE DEBUG ===');
    console.log(tableSection);
    console.log('Total lines:', lines.length);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        console.log(`Line ${i}: "${line}"`);
        console.log(`  Length: ${line.length}`);
        console.log(`  Tabs: ${(line.match(/\t/g) || []).length}`);
        console.log(`  Split by tabs: [${line.split('\t').map(c => `"${c}"`).join(', ')}]`);
        console.log('---');
    }
    return tableSection;
};

