export type ComparisonStyle = 'grouped-bars' | 'progress-bar' | 'stat-delta' | 'radial-gauge' | 'bullet' | 'target-line' | 'concentric-arcs' | 'speedometer' | 'thermometer' | 'segmented' | 'diverging' | 'zone-bar';
export declare function GenerationCards({ actualToday, performanceRatio, cuf, defaultStyle, showSwitcher, }: {
    actualToday: number;
    performanceRatio: number;
    cuf: number;
    defaultStyle?: ComparisonStyle;
    showSwitcher?: boolean;
}): import("react").JSX.Element;
