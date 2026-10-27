import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Message } from './Message';

describe('Message', () => {
  it('fills placeholders and keeps the language the text is in', () => {
    const html = renderToStaticMarkup(
      createElement(Message, { k: 'creative.services.emptyDescription', values: { name: 'Ana' } }),
    );
    expect(html).toBe('<span lang="en">Ana hasn&#x27;t added any services.</span>');
  });
});
