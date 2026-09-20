import { describe, it, expect, vi } from 'vitest';
import { generateAutomationDraft, type DraftCatalog } from '../modules/automations/automation-draft.service';

describe('automation-draft.service (TypeSafe Jev)', () => {
  const catalog: DraftCatalog = {
    variables: [
      { id: 'v_temp', key: 'temperature', deviceId: 'dev_greenhouse', deviceName: 'Greenhouse ESP32', unit: '°C', value: '28.5' },
      { id: 'v_fan', key: 'fan_relay', deviceId: 'dev_greenhouse', deviceName: 'Greenhouse ESP32', unit: null, value: 'false' },
    ],
    integrations: [
      { id: 'int_telegram', name: 'Farm Alerts Telegram', kind: 'telegram' },
    ],
  };

  it('successfully transforms Jev choices into a verified, reviewable graph', async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          trigger_kind: { type: 'choice', choice: 'variable', confidence: 0.95, probabilities: { variable: 0.95, none: 0.05 } },
          trigger_variable: { type: 'choice', choice: 'v0', confidence: 0.92, probabilities: { v0: 0.92, none: 0.08 } },
          trigger_operator: { type: 'choice', choice: 'gt', confidence: 0.9, probabilities: { gt: 0.9, none: 0.1 } },
          trigger_number: { type: 'choice', choice: 'n0', confidence: 0.98, probabilities: { n0: 0.98, none: 0.02 } },
          action_count: { type: 'choice', choice: 'two', confidence: 0.88, probabilities: { two: 0.88, none: 0.12 } },
          action1_kind: { type: 'choice', choice: 'set_variable', confidence: 0.96, probabilities: { set_variable: 0.96, none: 0.04 } },
          action1_variable: { type: 'choice', choice: 'v1', confidence: 0.94, probabilities: { v1: 0.94, none: 0.06 } },
          action1_value: { type: 'choice', choice: 'on', confidence: 0.97, probabilities: { on: 0.97, none: 0.03 } },
          action2_kind: { type: 'choice', choice: 'call_integration', confidence: 0.91, probabilities: { call_integration: 0.91, none: 0.09 } },
          action2_integration: { type: 'choice', choice: 'i0', confidence: 0.92, probabilities: { i0: 0.92, none: 0.08 } },
        },
      }),
    });

    const result = await generateAutomationDraft(
      'When greenhouse temperature is above 30, turn on the fan and notify Telegram',
      'Asia/Bangkok',
      catalog,
      'ts_test_key',
      mockFetcher as any
    );

    expect(mockFetcher).toHaveBeenCalledWith('https://api.typesafe.ai/v1/systemone', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer ts_test_key',
      }),
    }));

    expect(result.graph.nodes).toHaveLength(3);
    expect(result.graph.edges).toHaveLength(2);

    const [triggerNode, action1, action2] = result.graph.nodes;
    expect(triggerNode.kind).toBe('variable');
    expect(triggerNode.config).toEqual({
      variable: 'temperature',
      device: 'dev_greenhouse',
      operator: '>',
      value: '30',
    });

    expect(action1.kind).toBe('set_variable');
    expect(action1.config).toEqual({
      variable: 'fan_relay',
      device: 'dev_greenhouse',
      value: 'true',
    });

    expect(action2.kind).toBe('call_integration');
    expect(action2.config).toEqual({
      integration_id: 'int_telegram',
    });

    expect(result.reviewItems.some((r) => r.needsReview)).toBe(false);
  });

  it('flags missing or ambiguous values as needsReview', async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: {
          trigger_kind: { type: 'choice', choice: 'variable', confidence: 0.9, probabilities: { variable: 0.9 } },
          trigger_variable: { type: 'choice', choice: 'none', confidence: 0.8, probabilities: { none: 0.8 } },
          action_count: { type: 'choice', choice: 'one', confidence: 0.9, probabilities: { one: 0.9 } },
          action1_kind: { type: 'choice', choice: 'set_variable', confidence: 0.9, probabilities: { set_variable: 0.9 } },
          action1_variable: { type: 'choice', choice: 'none', confidence: 0.9, probabilities: { none: 0.9 } },
        },
      }),
    });

    const result = await generateAutomationDraft(
      'When it gets too hot, turn something on',
      'UTC',
      catalog,
      'ts_test_key',
      mockFetcher as any
    );

    expect(result.reviewItems.some((item) => item.needsReview)).toBe(true);
  });

  it('handles rate limits cleanly', async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    await expect(
      generateAutomationDraft('Turn on fan at 8:00', 'UTC', catalog, 'ts_test_key', mockFetcher as any)
    ).rejects.toThrow(/TypeSafe is busy/i);
  });
});
