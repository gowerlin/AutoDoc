/**
 * DOM Structure Analyzer
 * Task 2.1: 開發 DOM 結構分析器
 */

import { CDPWrapper } from '../browser/cdp_wrapper';
import { InteractiveElement, FormField, NavigationNode } from '../types';
import { ExplorationError } from '../error/error_types';

export interface DOMAnalysisResult {
  interactiveElements: InteractiveElement[];
  navigationStructure: NavigationNode;
  forms: FormField[];
  pageTitle: string;
  pageUrl: string;
}

export class DOMAnalyzer {
  private cdp: CDPWrapper;

  constructor(cdp: CDPWrapper) {
    this.cdp = cdp;
  }

  /**
   * 分析完整的 DOM 結構
   */
  async analyze(url: string): Promise<DOMAnalysisResult> {
    try {
      const [interactiveElements, navigationStructure, forms, pageTitle] = await Promise.all([
        this.extractInteractiveElements(),
        this.extractNavigationStructure(url),
        this.extractForms(),
        this.cdp.evaluate('document.title'),
      ]);

      return {
        interactiveElements,
        navigationStructure,
        forms,
        pageTitle: pageTitle || '',
        pageUrl: url,
      };
    } catch (error) {
      throw new ExplorationError('Failed to analyze DOM structure', { url, error });
    }
  }

  /**
   * 提取所有可互動元素
   * 識別 buttons, links, tabs, dropdowns, inputs
   */
  async extractInteractiveElements(): Promise<InteractiveElement[]> {
    try {
      const elements = await this.cdp.evaluate(`
        (() => {
          const elements = [];

          // Define selectors for interactive elements
          const selectors = {
            button: 'button, [role="button"], input[type="button"], input[type="submit"]',
            link: 'a[href], [role="link"]',
            tab: '[role="tab"], .tab, [class*="tab"]',
            dropdown: 'select, [role="listbox"], [role="combobox"]',
            input: 'input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="tel"], input[type="url"]',
            checkbox: 'input[type="checkbox"]',
            radio: 'input[type="radio"]',
            textarea: 'textarea'
          };

          // Helper function to get element text
          function getElementText(el) {
            return (el.textContent || el.innerText || el.value || el.placeholder || el.title || el.ariaLabel || '').trim();
          }

          // Helper function to generate CSS selector
          function getCSSSelector(el) {
            if (el.id) return '#' + el.id;
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(' ').filter(c => c && !c.match(/^\\d/));
              if (classes.length > 0) {
                return el.tagName.toLowerCase() + '.' + classes.join('.');
              }
            }

            // Generate path
            const path = [];
            let current = el;
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let selector = current.tagName.toLowerCase();
              if (current.id) {
                path.unshift('#' + current.id);
                break;
              }

              // Add nth-child if needed
              const parent = current.parentNode;
              if (parent) {
                const siblings = Array.from(parent.children);
                const index = siblings.indexOf(current);
                if (siblings.filter(s => s.tagName === current.tagName).length > 1) {
                  selector += ':nth-child(' + (index + 1) + ')';
                }
              }

              path.unshift(selector);
              current = current.parentNode;

              if (path.length > 5) break; // Limit depth
            }

            return path.join(' > ');
          }

          // Helper function to calculate importance score
          function calculateImportance(el, type) {
            let score = 0;

            // Type-based scoring
            const typeScores = {
              button: 8,
              link: 7,
              tab: 9,
              dropdown: 8,
              input: 6,
              checkbox: 5,
              radio: 5,
              textarea: 6
            };
            score += typeScores[type] || 5;

            // Position-based scoring (elements higher on page are more important)
            const rect = el.getBoundingClientRect();
            const scrollY = window.scrollY || window.pageYOffset;
            const absoluteY = rect.top + scrollY;
            const pageHeight = document.documentElement.scrollHeight;
            const positionScore = Math.max(0, 5 - (absoluteY / pageHeight) * 5);
            score += positionScore;

            // Size-based scoring
            const area = rect.width * rect.height;
            if (area > 10000) score += 3;
            else if (area > 5000) score += 2;
            else if (area > 1000) score += 1;

            // Semantic keywords in text/attributes
            const text = getElementText(el).toLowerCase();
            const keywords = ['save', 'submit', 'search', 'login', 'register', 'create', 'add', 'edit', 'delete', 'update', 'settings', 'config', 'admin', 'dashboard', 'manage'];
            keywords.forEach(keyword => {
              if (text.includes(keyword)) score += 2;
            });

            // Primary/CTA buttons
            const classes = (el.className || '').toLowerCase();
            if (classes.includes('primary') || classes.includes('cta') || classes.includes('main')) {
              score += 3;
            }

            // Aria attributes
            if (el.getAttribute('aria-label')) score += 1;

            return Math.min(score, 20); // Cap at 20
          }

          // Extract elements by type
          Object.entries(selectors).forEach(([type, selector]) => {
            try {
              const nodes = document.querySelectorAll(selector);
              nodes.forEach(el => {
                // Skip hidden elements
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                  return;
                }

                // Skip elements with no dimensions
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) {
                  return;
                }

                const text = getElementText(el);
                if (!text && type !== 'input' && type !== 'checkbox' && type !== 'radio') {
                  return; // Skip elements with no text (except inputs)
                }

                // Get attributes
                const attributes = {};
                if (el.attributes) {
                  for (let i = 0; i < el.attributes.length; i++) {
                    const attr = el.attributes[i];
                    attributes[attr.name] = attr.value;
                  }
                }

                elements.push({
                  selector: getCSSSelector(el),
                  type: type,
                  text: text,
                  attributes: attributes,
                  position: {
                    x: Math.round(rect.left + window.scrollX),
                    y: Math.round(rect.top + window.scrollY),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                  },
                  importance: calculateImportance(el, type),
                  visible: true
                });
              });
            } catch (e) {
              console.error('Error extracting ' + type + ' elements:', e);
            }
          });

          return elements;
        })()
      `);

      return elements || [];
    } catch (error) {
      throw new ExplorationError('Failed to extract interactive elements', { error });
    }
  }

  /**
   * 識別導航結構
   * 識別側邊欄、頂部選單、麵包屑導航
   */
  async extractNavigationStructure(currentUrl: string): Promise<NavigationNode> {
    try {
      const navData = await this.cdp.evaluate(`
        (() => {
          const navigation = {
            topNav: [],
            sidebar: [],
            breadcrumbs: [],
            footer: []
          };

          // Helper to extract links
          function extractLinks(container, type) {
            const links = [];
            if (!container) return links;

            const anchors = container.querySelectorAll('a[href]');
            anchors.forEach(a => {
              const href = a.getAttribute('href');
              const text = (a.textContent || '').trim();

              if (text && href) {
                links.push({
                  text: text,
                  href: href,
                  type: type
                });
              }
            });

            return links;
          }

          // Extract top navigation
          const topNavSelectors = ['nav', 'header nav', '[role="navigation"]', '.navbar', '.nav', '.header-nav'];
          topNavSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const rect = el.getBoundingClientRect();
              // Consider as top nav if in upper 20% of page
              if (rect.top < window.innerHeight * 0.2) {
                navigation.topNav.push(...extractLinks(el, 'top'));
              }
            });
          });

          // Extract sidebar
          const sidebarSelectors = ['aside', '.sidebar', '[role="complementary"]', '.side-nav', '.menu'];
          sidebarSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const rect = el.getBoundingClientRect();
              // Consider as sidebar if on left or right side
              if (rect.left < 300 || rect.right > window.innerWidth - 300) {
                navigation.sidebar.push(...extractLinks(el, 'sidebar'));
              }
            });
          });

          // Extract breadcrumbs
          const breadcrumbSelectors = ['[role="breadcrumb"]', '.breadcrumb', '.breadcrumbs', 'nav.breadcrumb'];
          breadcrumbSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              navigation.breadcrumbs.push(...extractLinks(el, 'breadcrumb'));
            });
          });

          // Extract footer navigation
          const footerSelectors = ['footer', 'footer nav', '.footer'];
          footerSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              navigation.footer.push(...extractLinks(el, 'footer'));
            });
          });

          return navigation;
        })()
      `);

      // Build navigation tree
      const rootNode: NavigationNode = {
        id: 'root',
        url: currentUrl,
        title: 'Root',
        type: 'page',
        children: [],
        depth: 0,
      };

      // Add top navigation as children
      if (navData.topNav) {
        navData.topNav.forEach((link: any, index: number) => {
          rootNode.children.push({
            id: `top-${index}`,
            url: this.resolveUrl(currentUrl, link.href),
            title: link.text,
            type: 'section',
            children: [],
            parent: 'root',
            depth: 1,
          });
        });
      }

      // Add sidebar navigation
      if (navData.sidebar) {
        navData.sidebar.forEach((link: any, index: number) => {
          rootNode.children.push({
            id: `sidebar-${index}`,
            url: this.resolveUrl(currentUrl, link.href),
            title: link.text,
            type: 'section',
            children: [],
            parent: 'root',
            depth: 1,
          });
        });
      }

      return rootNode;
    } catch (error) {
      throw new ExplorationError('Failed to extract navigation structure', { error });
    }
  }

  /**
   * 識別表單與輸入欄位
   */
  async extractForms(): Promise<FormField[]> {
    try {
      const forms = await this.cdp.evaluate(`
        (() => {
          const fields = [];

          // Find all forms
          const formElements = document.querySelectorAll('form, [role="form"]');

          formElements.forEach(form => {
            // Extract form fields
            const inputs = form.querySelectorAll('input, select, textarea');

            inputs.forEach(input => {
              // Skip hidden and button inputs
              if (input.type === 'hidden' || input.type === 'button' || input.type === 'submit') {
                return;
              }

              // Get field information
              const name = input.name || input.id || input.getAttribute('aria-label') || '';
              const type = input.type || input.tagName.toLowerCase();
              const required = input.hasAttribute('required') || input.getAttribute('aria-required') === 'true';
              const placeholder = input.placeholder || '';
              const value = input.value || '';

              // Extract validation rules
              let validation = '';
              if (input.pattern) validation += 'pattern:' + input.pattern + ';';
              if (input.min) validation += 'min:' + input.min + ';';
              if (input.max) validation += 'max:' + input.max + ';';
              if (input.minLength) validation += 'minLength:' + input.minLength + ';';
              if (input.maxLength) validation += 'maxLength:' + input.maxLength + ';';

              // Generate CSS selector
              let selector = '';
              if (input.id) {
                selector = '#' + input.id;
              } else if (input.name) {
                selector = input.tagName.toLowerCase() + '[name="' + input.name + '"]';
              } else {
                selector = input.tagName.toLowerCase();
              }

              fields.push({
                selector: selector,
                name: name,
                type: type,
                required: required,
                placeholder: placeholder,
                value: value,
                validation: validation
              });
            });
          });

          return fields;
        })()
      `);

      return forms || [];
    } catch (error) {
      throw new ExplorationError('Failed to extract forms', { error });
    }
  }

  /**
   * 處理 Shadow DOM
   */
  async extractFromShadowDOM(): Promise<InteractiveElement[]> {
    try {
      const shadowElements = await this.cdp.evaluate(`
        (() => {
          const elements = [];

          // Find all elements with shadow root
          function traverseShadowDOM(root) {
            const allElements = root.querySelectorAll('*');

            allElements.forEach(el => {
              if (el.shadowRoot) {
                // Process shadow DOM content
                const shadowLinks = el.shadowRoot.querySelectorAll('a[href], button, [role="button"]');

                shadowLinks.forEach(shadowEl => {
                  const rect = shadowEl.getBoundingClientRect();
                  const text = (shadowEl.textContent || '').trim();

                  if (text && rect.width > 0 && rect.height > 0) {
                    elements.push({
                      selector: 'shadow-dom-element',
                      type: shadowEl.tagName.toLowerCase() === 'a' ? 'link' : 'button',
                      text: text,
                      attributes: {},
                      position: {
                        x: Math.round(rect.left),
                        y: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                      },
                      importance: 5,
                      visible: true
                    });
                  }
                });

                // Recurse into shadow DOM
                traverseShadowDOM(el.shadowRoot);
              }
            });
          }

          traverseShadowDOM(document);
          return elements;
        })()
      `);

      return shadowElements || [];
    } catch (error) {
      console.error('Failed to extract from Shadow DOM:', error);
      return [];
    }
  }

  /**
   * 處理 iframe 內的元素
   */
  async extractFromIframes(): Promise<InteractiveElement[]> {
    try {
      const iframeElements = await this.cdp.evaluate(`
        (() => {
          const elements = [];
          const iframes = document.querySelectorAll('iframe');

          iframes.forEach(iframe => {
            try {
              // Try to access iframe content (will fail for cross-origin)
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

              if (iframeDoc) {
                const links = iframeDoc.querySelectorAll('a[href], button, [role="button"]');

                links.forEach(el => {
                  const rect = el.getBoundingClientRect();
                  const text = (el.textContent || '').trim();

                  if (text && rect.width > 0 && rect.height > 0) {
                    elements.push({
                      selector: 'iframe-element',
                      type: el.tagName.toLowerCase() === 'a' ? 'link' : 'button',
                      text: text,
                      attributes: {},
                      position: {
                        x: Math.round(rect.left),
                        y: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                      },
                      importance: 5,
                      visible: true
                    });
                  }
                });
              }
            } catch (e) {
              // Cross-origin iframe, skip
            }
          });

          return elements;
        })()
      `);

      return iframeElements || [];
    } catch (error) {
      console.error('Failed to extract from iframes:', error);
      return [];
    }
  }

  /**
   * 解析相對 URL
   */
  private resolveUrl(baseUrl: string, relativeUrl: string): string {
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch (error) {
      return relativeUrl;
    }
  }

  /**
   * 過濾重複元素
   */
  filterDuplicates(elements: InteractiveElement[]): InteractiveElement[] {
    const seen = new Set<string>();
    return elements.filter(el => {
      const key = `${el.type}-${el.text}-${el.position.x}-${el.position.y}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * 按重要性排序元素
   */
  sortByImportance(elements: InteractiveElement[]): InteractiveElement[] {
    return elements.sort((a, b) => b.importance - a.importance);
  }
}
