import { describe, it, expect } from 'vitest';
import { generateReproSteps } from '../src/repro-generator';
import type { TraceBugEvent } from '../src/types';

function ev(type: TraceBugEvent['type'], data: Record<string, any>, page = '/'): TraceBugEvent {
  return {
    id: Math.random().toString(36).slice(2, 10),
    sessionId: 'test-session',
    projectId: 'test-app',
    type,
    page,
    timestamp: Date.now(),
    data,
  };
}

describe('generateReproSteps', () => {
  it('returns a generic step when no events are present', () => {
    const r = generateReproSteps([], 'Something broke');
    expect(r.reproSteps).toContain('No user interactions recorded');
    expect(r.errorSummary).toContain('Something broke');
  });

  it('numbers click steps with element text', () => {
    const events = [
      ev('click', { element: { tag: 'button', text: 'Save' } }),
      ev('click', { element: { tag: 'button', text: 'Cancel' } }),
    ];
    const r = generateReproSteps(events, 'Oops');
    expect(r.reproSteps).toContain('1. Click "Save" button');
    expect(r.reproSteps).toContain('2. Click "Cancel" button');
  });

  it('shows field name and value for input events', () => {
    const events = [
      ev('input', { element: { name: 'email', type: 'text', value: 'alice@example.com' } }),
    ];
    const r = generateReproSteps(events, 'x');
    expect(r.reproSteps).toContain('Type "alice@example.com" in "email" field');
  });

  it('does not reveal redacted input values', () => {
    const events = [
      ev('input', { element: { name: 'password', type: 'password', value: '[REDACTED]', valueLength: 12 } }),
    ];
    const r = generateReproSteps(events, 'x');
    expect(r.reproSteps).not.toContain('[REDACTED]');
    expect(r.reproSteps).toContain('Type in "password" field');
    expect(r.reproSteps).toContain('12 characters');
  });

  it('describes select changes with option text', () => {
    const events = [
      ev('select_change', { element: { name: 'status', selectedText: 'Inactive', value: 'inactive' } }),
    ];
    const r = generateReproSteps(events, 'x');
    expect(r.reproSteps).toContain('Select "Inactive" from "status" dropdown');
  });

  it('describes form submission with id and field count', () => {
    const events = [
      ev('form_submit', { form: { id: 'checkout-form', fieldCount: 4 } }),
    ];
    const r = generateReproSteps(events, 'x');
    expect(r.reproSteps).toContain('Submit checkout-form form (4 fields)');
  });

  it('includes route change with from/to path', () => {
    const events = [
      ev('route_change', { from: '/', to: '/vendor' }, '/vendor'),
    ];
    const r = generateReproSteps(events, 'x');
    expect(r.reproSteps).toMatch(/Navigate to .*Vendor page/);
    expect(r.reproSteps).toContain('/vendor');
  });

  it('includes API failure with status code', () => {
    const events = [
      ev('api_request', { request: { method: 'POST', url: '/api/vendor/update', statusCode: 500, durationMs: 120 } }),
    ];
    const r = generateReproSteps(events, 'x');
    expect(r.reproSteps).toContain('API call fails');
    expect(r.reproSteps).toContain('500');
  });

  it('omits successful API calls', () => {
    const events = [
      ev('api_request', { request: { method: 'GET', url: '/api/ok', statusCode: 200, durationMs: 50 } }),
    ];
    const r = generateReproSteps(events, 'x');
    expect(r.reproSteps).not.toContain('API call fails');
  });

  it('captures error events and includes message', () => {
    const events = [
      ev('error', { error: { message: "Cannot read properties of undefined" } }),
    ];
    const r = generateReproSteps(events, 'Cannot read properties of undefined');
    expect(r.reproSteps).toContain('Error: "Cannot read properties of undefined"');
  });

  it('deduplicates consecutive identical click steps', () => {
    const events = [
      ev('click', { element: { tag: 'button', text: 'Save' } }),
      ev('click', { element: { tag: 'button', text: 'Save' } }),
      ev('click', { element: { tag: 'button', text: 'Save' } }),
    ];
    const r = generateReproSteps(events, 'x');
    const matches = r.reproSteps.match(/Click "Save"/g) || [];
    expect(matches.length).toBe(1);
  });

  it('skips React dev warning console errors', () => {
    const events = [
      ev('console_error', { error: { message: 'Warning: Each child in a list should have a unique "key"' } }),
    ];
    const r = generateReproSteps(events, 'x');
    expect(r.reproSteps).not.toContain('Each child');
  });

  it('preserves ordering across mixed event types', () => {
    const events = [
      ev('route_change', { from: '/', to: '/checkout' }, '/checkout'),
      ev('click', { element: { tag: 'button', text: 'Place Order' } }),
      ev('api_request', { request: { method: 'POST', url: '/api/orders', statusCode: 500, durationMs: 200 } }),
      ev('error', { error: { message: 'TypeError' } }),
    ];
    const r = generateReproSteps(events, 'TypeError');
    const idxNav = r.reproSteps.indexOf('Navigate');
    const idxClick = r.reproSteps.indexOf('Click "Place Order"');
    const idxApi = r.reproSteps.indexOf('API call fails');
    const idxErr = r.reproSteps.indexOf('Error:');
    expect(idxNav).toBeLessThan(idxClick);
    expect(idxClick).toBeLessThan(idxApi);
    expect(idxApi).toBeLessThan(idxErr);
  });

  it('errorSummary includes error message, page, and last action', () => {
    const events = [
      ev('route_change', { from: '/', to: '/checkout' }, '/checkout'),
      ev('click', { element: { text: 'Place Order' } }, '/checkout'),
      ev('error', { error: { message: 'Boom' } }, '/checkout'),
    ];
    const r = generateReproSteps(events, 'Boom');
    expect(r.errorSummary).toContain('Error: Boom');
    expect(r.errorSummary).toContain('Page: /checkout');
    expect(r.errorSummary).toContain('Last action: clicked "Place Order"');
  });
});
