/**
 * UI Audit Scanner - Client-side UI issue detection
 * Phase 7: Scan for overflow, clipping, font sizes, contrast issues
 */

interface UIIssue {
  id: string;
  type: 'overflow' | 'clipping' | 'font_size' | 'contrast' | 'spacing' | 'alignment';
  severity: 'warning' | 'error';
  element: string;
  description: string;
  suggestion: string;
  autoFixable: boolean;
}

interface AuditResult {
  timestamp: Date;
  issues: UIIssue[];
  passed: boolean;
  score: number; // 0-100
}

class UIAuditScanner {
  private lastAudit: AuditResult | null = null;
  private minFontSize = 12; // WCAG minimum
  private minContrastRatio = 4.5; // WCAG AA

  /**
   * Run a full UI audit on the current page
   */
  runAudit(containerSelector: string = 'body'): AuditResult {
    const issues: UIIssue[] = [];
    const container = document.querySelector(containerSelector);
    
    if (!container) {
      return {
        timestamp: new Date(),
        issues: [{
          id: 'container_not_found',
          type: 'clipping',
          severity: 'error',
          element: containerSelector,
          description: 'Audit container not found',
          suggestion: 'Check that the container selector is valid',
          autoFixable: false,
        }],
        passed: false,
        score: 0,
      };
    }

    // Check all visible elements
    const elements = container.querySelectorAll('*');
    
    elements.forEach((el, index) => {
      const htmlEl = el as HTMLElement;
      const styles = window.getComputedStyle(htmlEl);
      const rect = htmlEl.getBoundingClientRect();

      // Skip hidden elements
      if (styles.display === 'none' || styles.visibility === 'hidden') return;
      if (rect.width === 0 || rect.height === 0) return;

      // Check for overflow/clipping
      const overflowIssue = this.checkOverflow(htmlEl, styles, rect, index);
      if (overflowIssue) issues.push(overflowIssue);

      // Check font size
      const fontIssue = this.checkFontSize(htmlEl, styles, index);
      if (fontIssue) issues.push(fontIssue);

      // Check text contrast
      const contrastIssue = this.checkContrast(htmlEl, styles, index);
      if (contrastIssue) issues.push(contrastIssue);

      // Check spacing
      const spacingIssue = this.checkSpacing(htmlEl, styles, rect, index);
      if (spacingIssue) issues.push(spacingIssue);
    });

    // Calculate score
    const maxPossibleIssues = elements.length * 4; // 4 types of checks
    const issueWeight = issues.reduce((sum, issue) => 
      sum + (issue.severity === 'error' ? 2 : 1), 0);
    const score = Math.max(0, Math.round(100 - (issueWeight / Math.max(1, maxPossibleIssues / 10)) * 100));

    this.lastAudit = {
      timestamp: new Date(),
      issues,
      passed: issues.filter(i => i.severity === 'error').length === 0,
      score,
    };

    return this.lastAudit;
  }

  /**
   * Check for overflow/clipping issues
   */
  private checkOverflow(
    el: HTMLElement,
    styles: CSSStyleDeclaration,
    rect: DOMRect,
    index: number
  ): UIIssue | null {
    // Check if content is clipped
    if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) {
      // Check if overflow is intentional (scrollable)
      const isScrollable = styles.overflow === 'auto' || styles.overflow === 'scroll' ||
        styles.overflowX === 'auto' || styles.overflowX === 'scroll' ||
        styles.overflowY === 'auto' || styles.overflowY === 'scroll';
      
      if (!isScrollable && styles.overflow === 'hidden') {
        const tagName = el.tagName.toLowerCase();
        const className = el.className?.toString().slice(0, 50) || '';
        
        return {
          id: `overflow_${index}`,
          type: 'overflow',
          severity: 'warning',
          element: `${tagName}.${className}`,
          description: `Content is clipped (${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight})`,
          suggestion: 'Increase container size or add scroll behavior',
          autoFixable: true,
        };
      }
    }

    return null;
  }

  /**
   * Check for font size issues
   */
  private checkFontSize(
    el: HTMLElement,
    styles: CSSStyleDeclaration,
    index: number
  ): UIIssue | null {
    // Only check text-containing elements
    if (!el.textContent?.trim()) return null;
    if (el.children.length > 0 && el.childNodes.length === el.children.length) return null;

    const fontSize = parseFloat(styles.fontSize);
    
    if (fontSize > 0 && fontSize < this.minFontSize) {
      const tagName = el.tagName.toLowerCase();
      const className = el.className?.toString().slice(0, 50) || '';
      
      return {
        id: `font_${index}`,
        type: 'font_size',
        severity: 'error',
        element: `${tagName}.${className}`,
        description: `Font size ${fontSize}px is below WCAG minimum of ${this.minFontSize}px`,
        suggestion: `Increase font size to at least ${this.minFontSize}px`,
        autoFixable: true,
      };
    }

    return null;
  }

  /**
   * Check for contrast issues
   */
  private checkContrast(
    el: HTMLElement,
    styles: CSSStyleDeclaration,
    index: number
  ): UIIssue | null {
    // Only check elements with visible text
    if (!el.textContent?.trim()) return null;
    if (el.children.length > 0 && el.childNodes.length === el.children.length) return null;

    const color = styles.color;
    const bgColor = this.getEffectiveBackgroundColor(el);

    if (color && bgColor) {
      const ratio = this.calculateContrastRatio(color, bgColor);
      
      if (ratio < this.minContrastRatio) {
        const tagName = el.tagName.toLowerCase();
        const className = el.className?.toString().slice(0, 50) || '';
        
        return {
          id: `contrast_${index}`,
          type: 'contrast',
          severity: ratio < 3 ? 'error' : 'warning',
          element: `${tagName}.${className}`,
          description: `Contrast ratio ${ratio.toFixed(2)}:1 is below WCAG AA (${this.minContrastRatio}:1)`,
          suggestion: 'Increase text/background color contrast',
          autoFixable: false,
        };
      }
    }

    return null;
  }

  /**
   * Check for spacing issues
   */
  private checkSpacing(
    el: HTMLElement,
    styles: CSSStyleDeclaration,
    rect: DOMRect,
    index: number
  ): UIIssue | null {
    // Check for elements that might be too cramped
    const padding = parseFloat(styles.padding) || 0;
    const hasText = el.textContent?.trim();
    
    if (hasText && rect.height > 0 && rect.height < 16 && padding === 0) {
      const tagName = el.tagName.toLowerCase();
      const className = el.className?.toString().slice(0, 50) || '';
      
      // Only flag interactive elements or important content
      if (['button', 'a', 'input', 'select'].includes(tagName)) {
        return {
          id: `spacing_${index}`,
          type: 'spacing',
          severity: 'warning',
          element: `${tagName}.${className}`,
          description: `Element height (${rect.height}px) may be too small for comfortable interaction`,
          suggestion: 'Add padding or increase line-height for better touch targets',
          autoFixable: true,
        };
      }
    }

    return null;
  }

  /**
   * Get effective background color (walks up the DOM tree)
   */
  private getEffectiveBackgroundColor(el: HTMLElement): string {
    let current: HTMLElement | null = el;
    
    while (current) {
      const bg = window.getComputedStyle(current).backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
        return bg;
      }
      current = current.parentElement;
    }
    
    return 'rgb(255, 255, 255)'; // Default to white
  }

  /**
   * Calculate contrast ratio between two colors
   */
  private calculateContrastRatio(color1: string, color2: string): number {
    const lum1 = this.getLuminance(color1);
    const lum2 = this.getLuminance(color2);
    
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Get relative luminance of a color
   */
  private getLuminance(color: string): number {
    // Parse RGB values from color string
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return 0;

    const [, r, g, b] = match.map(Number);
    
    const toLinear = (c: number) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  /**
   * Get last audit result
   */
  getLastAudit(): AuditResult | null {
    return this.lastAudit;
  }

  /**
   * Get summary of issues
   */
  getSummary(): {
    total: number;
    errors: number;
    warnings: number;
    byType: Record<string, number>;
    autoFixable: number;
  } {
    if (!this.lastAudit) {
      return { total: 0, errors: 0, warnings: 0, byType: {}, autoFixable: 0 };
    }

    const byType: Record<string, number> = {};
    let autoFixable = 0;

    this.lastAudit.issues.forEach(issue => {
      byType[issue.type] = (byType[issue.type] || 0) + 1;
      if (issue.autoFixable) autoFixable++;
    });

    return {
      total: this.lastAudit.issues.length,
      errors: this.lastAudit.issues.filter(i => i.severity === 'error').length,
      warnings: this.lastAudit.issues.filter(i => i.severity === 'warning').length,
      byType,
      autoFixable,
    };
  }
}

// Singleton instance
export const uiAuditScanner = new UIAuditScanner();
