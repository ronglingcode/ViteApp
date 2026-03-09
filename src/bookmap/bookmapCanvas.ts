import type { OrderBookSnapshot, BookmapConfig } from './bookmapModels';
import { DEFAULT_BOOKMAP_CONFIG } from './bookmapModels';
import { TradeClusterer } from './tradeClusterer';
import { OrderBookHistory } from './orderBookHistory';
import * as ChartSettings from '../ui/chartSettings';

/**
 * BookmapCanvas — pure canvas chart with continuous time axis.
 * No TradingView LWC dependency. Supports mouse zoom, pan, crosshair.
 */
export class BookmapCanvas {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private panelElement: HTMLElement;
    private clusterer: TradeClusterer;
    private config: BookmapConfig;
    private orderBook: OrderBookSnapshot | null = null;
    private bookHistory: OrderBookHistory;
    private animationFrameId: number | null = null;
    private needsRedraw: boolean = true;
    private symbol: string;

    // View state: visible time/price window
    private timeFrom: number = 0;   // ms
    private timeTo: number = 0;     // ms
    private priceFrom: number = 0;
    private priceTo: number = 0;
    private autoFitPrice: boolean = true;

    // Layout constants
    private priceAxisWidth: number = 60;
    private timeAxisHeight: number = 20;
    private bgColor: string = '#1a1a2e';
    private gridColor: string = '#333';
    private textColor: string = '#aaa';

    // Mouse interaction state
    private isDragging: boolean = false;
    private dragStartX: number = 0;
    private dragStartY: number = 0;
    private dragStartTimeFrom: number = 0;
    private dragStartTimeTo: number = 0;
    private dragStartPriceFrom: number = 0;
    private dragStartPriceTo: number = 0;
    private dragOnPriceAxis: boolean = false;
    private mouseX: number = -1;
    private mouseY: number = -1;

    constructor(
        symbol: string,
        panelElement: HTMLElement,
        chartWidth: number,
        config?: Partial<BookmapConfig>
    ) {
        this.symbol = symbol;
        this.panelElement = panelElement;
        this.config = { ...DEFAULT_BOOKMAP_CONFIG, ...config };
        this.clusterer = new TradeClusterer(this.config);
        this.bookHistory = new OrderBookHistory(this.config.heatmapMaxHistory);

        // Initialize time window to now - 5 minutes
        let now = Date.now();
        this.timeFrom = now - 5 * 60 * 1000;
        this.timeTo = now + 30 * 1000;

        // Fix panel size so canvas doesn't cause feedback loop
        this.panelElement.style.position = 'relative';
        this.panelElement.style.width = chartWidth + 'px';
        this.panelElement.style.height = ChartSettings.bookmapHeight + 'px';
        this.panelElement.style.overflow = 'hidden';

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d')!;
        this.setCanvasSize(chartWidth, ChartSettings.bookmapHeight);
        this.panelElement.appendChild(this.canvas);

        this.setupMouseHandlers();
        this.startRenderLoop();

        // Show the panel
        panelElement.style.display = 'block';
    }

    private setCanvasSize(width: number, height: number): void {
        let dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.needsRedraw = true;
    }

    // ============================================
    // Coordinate mapping
    // ============================================

    private get chartWidth(): number {
        return (this.canvas.width / (window.devicePixelRatio || 1)) - this.priceAxisWidth;
    }

    private get chartHeight(): number {
        return (this.canvas.height / (window.devicePixelRatio || 1)) - this.timeAxisHeight;
    }

    private timeToX(timeMs: number): number {
        if (this.timeTo === this.timeFrom) return 0;
        return ((timeMs - this.timeFrom) / (this.timeTo - this.timeFrom)) * this.chartWidth;
    }

    private priceToY(price: number): number {
        if (this.priceTo === this.priceFrom) return this.chartHeight / 2;
        // Price increases upward, Y increases downward
        return this.chartHeight - ((price - this.priceFrom) / (this.priceTo - this.priceFrom)) * this.chartHeight;
    }

    private xToTime(x: number): number {
        return this.timeFrom + (x / this.chartWidth) * (this.timeTo - this.timeFrom);
    }

    private yToPrice(y: number): number {
        return this.priceFrom + ((this.chartHeight - y) / this.chartHeight) * (this.priceTo - this.priceFrom);
    }

    // ============================================
    // Mouse handlers
    // ============================================

    private setupMouseHandlers(): void {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            let zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;

            let rect = this.canvas.getBoundingClientRect();
            let mx = e.clientX - rect.left;
            let my = e.clientY - rect.top;
            let onPriceAxis = mx > this.chartWidth;

            if (onPriceAxis || e.shiftKey) {
                // Y-axis zoom: zoom price around mouse Y
                this.autoFitPrice = false;
                let priceAtMouse = this.yToPrice(my);
                this.priceFrom = priceAtMouse - (priceAtMouse - this.priceFrom) * zoomFactor;
                this.priceTo = priceAtMouse + (this.priceTo - priceAtMouse) * zoomFactor;
            } else {
                // X-axis zoom: zoom time around mouse X
                let timeAtMouse = this.xToTime(mx);
                this.timeFrom = timeAtMouse - (timeAtMouse - this.timeFrom) * zoomFactor;
                this.timeTo = timeAtMouse + (this.timeTo - timeAtMouse) * zoomFactor;
            }

            this.needsRedraw = true;
        });

        // Double-click to reset Y auto-fit
        this.canvas.addEventListener('dblclick', (e) => {
            let rect = this.canvas.getBoundingClientRect();
            let mx = e.clientX - rect.left;
            if (mx > this.chartWidth) {
                this.autoFitPrice = true;
                this.needsRedraw = true;
            }
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            let rect = this.canvas.getBoundingClientRect();
            let mx = e.clientX - rect.left;
            this.dragOnPriceAxis = mx > this.chartWidth;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.dragStartTimeFrom = this.timeFrom;
            this.dragStartTimeTo = this.timeTo;
            this.dragStartPriceFrom = this.priceFrom;
            this.dragStartPriceTo = this.priceTo;
            this.canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            let rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;

            if (this.isDragging) {
                let dx = e.clientX - this.dragStartX;
                let dy = e.clientY - this.dragStartY;

                if (this.dragOnPriceAxis) {
                    // Drag on price axis: pan price only
                    this.autoFitPrice = false;
                    let priceRange = this.dragStartPriceTo - this.dragStartPriceFrom;
                    let priceDelta = (dy / this.chartHeight) * priceRange;
                    this.priceFrom = this.dragStartPriceFrom + priceDelta;
                    this.priceTo = this.dragStartPriceTo + priceDelta;
                } else {
                    // Drag on chart: pan time (and price if manual)
                    let timeRange = this.dragStartTimeTo - this.dragStartTimeFrom;
                    let timeDelta = -(dx / this.chartWidth) * timeRange;
                    this.timeFrom = this.dragStartTimeFrom + timeDelta;
                    this.timeTo = this.dragStartTimeTo + timeDelta;

                    if (!this.autoFitPrice) {
                        let priceRange = this.dragStartPriceTo - this.dragStartPriceFrom;
                        let priceDelta = (dy / this.chartHeight) * priceRange;
                        this.priceFrom = this.dragStartPriceFrom + priceDelta;
                        this.priceTo = this.dragStartPriceTo + priceDelta;
                    }
                }
            }

            this.needsRedraw = true;
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'crosshair';
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.mouseX = -1;
            this.mouseY = -1;
            this.needsRedraw = true;
        });

        this.canvas.style.cursor = 'crosshair';
    }

    private startRenderLoop(): void {
        let renderFrame = () => {
            if (this.needsRedraw) {
                this.draw();
                this.needsRedraw = false;
            }
            this.animationFrameId = requestAnimationFrame(renderFrame);
        };
        this.animationFrameId = requestAnimationFrame(renderFrame);
    }

    // ============================================
    // Public API
    // ============================================

    addTrade(price: number, size: number, timestamp: number): void {
        this.clusterer.addTrade(price, size, timestamp);

        // Auto-scroll: keep latest trades visible
        let now = Date.now();
        let visibleRange = this.timeTo - this.timeFrom;
        if (!this.isDragging && timestamp > this.timeTo - visibleRange * 0.05) {
            this.timeTo = now + visibleRange * 0.05;
            this.timeFrom = this.timeTo - visibleRange;
        }

        this.needsRedraw = true;
    }

    updateOrderBook(orderBook: OrderBookSnapshot): void {
        this.orderBook = orderBook;
        if (this.config.heatmapEnabled) {
            this.bookHistory.addSnapshot(orderBook);
        }
        this.needsRedraw = true;
    }

    show(): void {
        this.panelElement.style.display = 'block';
        this.needsRedraw = true;
    }

    hide(): void {
        this.panelElement.style.display = 'none';
    }

    // ============================================
    // Rendering
    // ============================================

    private draw(): void {
        let totalWidth = this.canvas.width / (window.devicePixelRatio || 1);
        let totalHeight = this.canvas.height / (window.devicePixelRatio || 1);

        // Auto-fit price range to visible clusters
        if (this.autoFitPrice) {
            this.fitPriceToVisibleClusters();
        }

        // Background
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, totalWidth, totalHeight);

        // Clip chart area for drawing
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.chartWidth, this.chartHeight);
        this.ctx.clip();

        this.drawGrid();

        if (this.config.heatmapEnabled && this.bookHistory.length > 0) {
            this.drawHeatmap();
        }

        this.drawVolumeDots();
        this.drawCrosshair();

        this.ctx.restore();

        // Draw axes
        this.drawPriceAxis(totalHeight);
        this.drawTimeAxis(totalWidth);
    }

    private fitPriceToVisibleClusters(): void {
        let clusters = this.clusterer.getVisibleClusters();
        let minPrice = Infinity;
        let maxPrice = -Infinity;
        let hasVisible = false;

        for (let cluster of clusters) {
            if (cluster.timeBucket >= this.timeFrom && cluster.timeBucket <= this.timeTo) {
                if (cluster.priceLevel < minPrice) minPrice = cluster.priceLevel;
                if (cluster.priceLevel > maxPrice) maxPrice = cluster.priceLevel;
                hasVisible = true;
            }
        }

        if (!hasVisible) return;

        let padding = (maxPrice - minPrice) * 0.1 || 0.05;
        this.priceFrom = minPrice - padding;
        this.priceTo = maxPrice + padding;
    }

    private drawGrid(): void {
        this.ctx.strokeStyle = this.gridColor;
        this.ctx.lineWidth = 0.5;

        // Horizontal price grid lines
        let priceStep = this.calcNiceStep(this.priceTo - this.priceFrom, 8);
        let firstPrice = Math.ceil(this.priceFrom / priceStep) * priceStep;
        for (let p = firstPrice; p <= this.priceTo; p += priceStep) {
            let y = this.priceToY(p);
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.chartWidth, y);
            this.ctx.stroke();
        }

        // Vertical time grid lines
        let timeRange = this.timeTo - this.timeFrom;
        let timeStep = this.calcNiceTimeStep(timeRange, 6);
        let firstTime = Math.ceil(this.timeFrom / timeStep) * timeStep;
        for (let t = firstTime; t <= this.timeTo; t += timeStep) {
            let x = this.timeToX(t);
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.chartHeight);
            this.ctx.stroke();
        }
    }

    private drawVolumeDots(): void {
        let clusters = this.clusterer.getVisibleClusters();

        for (let cluster of clusters) {
            let x = this.timeToX(cluster.timeBucket);
            let y = this.priceToY(cluster.priceLevel);

            // Skip if outside visible area (with margin for dot radius)
            if (x < -20 || x > this.chartWidth + 20) continue;
            if (y < -20 || y > this.chartHeight + 20) continue;

            // Radius: sqrt scaling
            let sizeFraction = Math.min(cluster.totalSize / this.config.maxSharesForScaling, 1);
            let radius = this.config.minDotRadius +
                (this.config.maxDotRadius - this.config.minDotRadius) * Math.sqrt(sizeFraction);

            let isGreen = cluster.netDirection >= 0;
            let color = isGreen
                ? `rgba(0, 200, 83, ${this.config.dotOpacity})`
                : `rgba(255, 23, 68, ${this.config.dotOpacity})`;

            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();
        }
    }

    private drawCrosshair(): void {
        if (this.mouseX < 0 || this.mouseX > this.chartWidth) return;
        if (this.mouseY < 0 || this.mouseY > this.chartHeight) return;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 0.5;
        this.ctx.setLineDash([4, 4]);

        // Vertical line
        this.ctx.beginPath();
        this.ctx.moveTo(this.mouseX, 0);
        this.ctx.lineTo(this.mouseX, this.chartHeight);
        this.ctx.stroke();

        // Horizontal line
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.mouseY);
        this.ctx.lineTo(this.chartWidth, this.mouseY);
        this.ctx.stroke();

        this.ctx.setLineDash([]);

        // Price label at crosshair
        let price = this.yToPrice(this.mouseY);
        let priceText = price.toFixed(2);
        this.ctx.fillStyle = '#555';
        this.ctx.fillRect(this.chartWidth, this.mouseY - 8, this.priceAxisWidth, 16);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(priceText, this.chartWidth + 4, this.mouseY + 4);

        // Time label at crosshair
        let time = this.xToTime(this.mouseX);
        let timeText = this.formatTime(time);
        let textWidth = this.ctx.measureText(timeText).width + 8;
        this.ctx.fillStyle = '#555';
        this.ctx.fillRect(this.mouseX - textWidth / 2, this.chartHeight, textWidth, this.timeAxisHeight);
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(timeText, this.mouseX, this.chartHeight + 13);
    }

    private drawPriceAxis(totalHeight: number): void {
        // Background
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(this.chartWidth, 0, this.priceAxisWidth, totalHeight);

        // Border
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(this.chartWidth, 0);
        this.ctx.lineTo(this.chartWidth, this.chartHeight);
        this.ctx.stroke();

        // Labels
        this.ctx.fillStyle = this.textColor;
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'left';

        let priceStep = this.calcNiceStep(this.priceTo - this.priceFrom, 8);
        let firstPrice = Math.ceil(this.priceFrom / priceStep) * priceStep;
        for (let p = firstPrice; p <= this.priceTo; p += priceStep) {
            let y = this.priceToY(p);
            if (y > 0 && y < this.chartHeight) {
                this.ctx.fillText(p.toFixed(2), this.chartWidth + 4, y + 3);
            }
        }
    }

    private drawTimeAxis(totalWidth: number): void {
        // Background
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, this.chartHeight, totalWidth, this.timeAxisHeight);

        // Border
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.chartHeight);
        this.ctx.lineTo(this.chartWidth, this.chartHeight);
        this.ctx.stroke();

        // Labels
        this.ctx.fillStyle = this.textColor;
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'center';

        let timeRange = this.timeTo - this.timeFrom;
        let timeStep = this.calcNiceTimeStep(timeRange, 6);
        let firstTime = Math.ceil(this.timeFrom / timeStep) * timeStep;
        for (let t = firstTime; t <= this.timeTo; t += timeStep) {
            let x = this.timeToX(t);
            if (x > 0 && x < this.chartWidth) {
                this.ctx.fillText(this.formatTime(t), x, this.chartHeight + 13);
            }
        }
    }

    /**
     * Draw 2D time-history heatmap: each time slice paints colored rectangles
     * at price levels. Orders that persist across slices form horizontal "walls"
     * that grow over time. Color scales from dark blue (small) to bright red (large).
     */
    private drawHeatmap(): void {
        let slices = this.bookHistory.getSlicesInRange(this.timeFrom, this.timeTo);
        if (slices.length === 0) return;

        let minSize = this.config.heatmapMinSize;
        let pixelsPerMs = this.chartWidth / (this.timeTo - this.timeFrom);
        let priceRange = this.priceTo - this.priceFrom;
        if (priceRange <= 0) return;

        // Row height: each $0.01 price level gets proportional pixel height, minimum 1px
        let rowHeight = Math.max(1, (this.chartHeight / priceRange) * 0.01);

        // When zoomed out, skip slices that would be sub-pixel to save perf
        let minSlicePixelWidth = 0.5;
        let skipFactor = 1;
        if (slices.length > 1) {
            let avgGapMs = (slices[slices.length - 1].timestamp - slices[0].timestamp) / slices.length;
            let avgGapPx = avgGapMs * pixelsPerMs;
            if (avgGapPx < minSlicePixelWidth) {
                skipFactor = Math.ceil(minSlicePixelWidth / avgGapPx);
            }
        }

        for (let i = 0; i < slices.length; i += skipFactor) {
            let slice = slices[i];
            let x = this.timeToX(slice.timestamp);

            // Width extends to next slice (or small default)
            let nextIdx = Math.min(i + skipFactor, slices.length - 1);
            let nextTime = (nextIdx > i)
                ? slices[nextIdx].timestamp
                : slice.timestamp + 1000;
            let w = Math.max(1, (nextTime - slice.timestamp) * pixelsPerMs);

            // Skip if off-screen
            if (x + w < 0 || x > this.chartWidth) continue;

            for (let [price, size] of slice.levels) {
                if (size < minSize) continue;

                let y = this.priceToY(price);
                if (y < -rowHeight || y > this.chartHeight + rowHeight) continue;

                let color = this.sizeToColor(size);
                if (!color) continue;

                this.ctx.fillStyle = color;
                this.ctx.fillRect(x, y - rowHeight / 2, w, rowHeight);
            }
        }
    }

    /**
     * Map order size to a color on the heatmap scale.
     * Dark blue/black (small) → blue → cyan → green → yellow → orange → bright red (large).
     */
    private sizeToColor(size: number): string {
        if (size < this.config.heatmapMinSize) return '';

        let fraction = Math.min(size / this.config.heatmapMaxSize, 1);
        let r: number, g: number, b: number;

        if (fraction < 0.15) {
            // Dark blue/black → blue
            let t = fraction / 0.15;
            r = 0; g = 0; b = Math.floor(40 + t * 140);
        } else if (fraction < 0.3) {
            // Blue → cyan
            let t = (fraction - 0.15) / 0.15;
            r = 0; g = Math.floor(t * 180); b = Math.floor(180 - t * 30);
        } else if (fraction < 0.5) {
            // Cyan → green
            let t = (fraction - 0.3) / 0.2;
            r = 0; g = Math.floor(180 + t * 20); b = Math.floor(150 - t * 150);
        } else if (fraction < 0.7) {
            // Green → yellow
            let t = (fraction - 0.5) / 0.2;
            r = Math.floor(t * 255); g = Math.floor(200 + t * 55); b = 0;
        } else if (fraction < 0.85) {
            // Yellow → orange
            let t = (fraction - 0.7) / 0.15;
            r = 255; g = Math.floor(255 - t * 115); b = 0;
        } else {
            // Orange → bright red
            let t = (fraction - 0.85) / 0.15;
            r = 255; g = Math.floor(140 - t * 140); b = 0;
        }

        return `rgb(${r}, ${g}, ${b})`;
    }

    // ============================================
    // Utility
    // ============================================

    private formatTime(ms: number): string {
        let d = new Date(ms);
        let h = d.getHours().toString().padStart(2, '0');
        let m = d.getMinutes().toString().padStart(2, '0');
        let s = d.getSeconds().toString().padStart(2, '0');
        let timeRange = this.timeTo - this.timeFrom;
        // Show seconds when zoomed in under 10 minutes
        if (timeRange < 10 * 60 * 1000) {
            return `${h}:${m}:${s}`;
        }
        return `${h}:${m}`;
    }

    private calcNiceStep(range: number, targetTicks: number): number {
        let rough = range / targetTicks;
        let mag = Math.pow(10, Math.floor(Math.log10(rough)));
        let normalized = rough / mag;
        let nice: number;
        if (normalized < 1.5) nice = 1;
        else if (normalized < 3.5) nice = 2;
        else if (normalized < 7.5) nice = 5;
        else nice = 10;
        return nice * mag;
    }

    private calcNiceTimeStep(rangeMs: number, targetTicks: number): number {
        let steps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000];
        let rough = rangeMs / targetTicks;
        for (let s of steps) {
            if (s >= rough) return s;
        }
        return 3600000;
    }

    // ============================================
    // Lifecycle
    // ============================================

    requestRedraw(): void {
        this.needsRedraw = true;
    }

    destroy(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.canvas.remove();
        this.clusterer.clear();
    }

    reset(): void {
        this.clusterer.clear();
        this.orderBook = null;
        this.bookHistory.clear();
        this.needsRedraw = true;
    }
}
