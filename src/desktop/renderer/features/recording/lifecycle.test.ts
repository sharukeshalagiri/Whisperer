import { describe, expect, it } from 'vitest';

import { CaptureGenerationController, isCapturing, retryAction } from './lifecycle';

describe('CaptureGenerationController', () => {
  it('invalidates pending work after cancellation', () => {
    const controller = new CaptureGenerationController();
    const generation = controller.begin();

    expect(controller.isCurrent(generation)).toBe(true);
    controller.cancel();
    expect(controller.isCurrent(generation)).toBe(false);
  });

  it('invalidates an earlier submission when a later capture starts', () => {
    const controller = new CaptureGenerationController();
    const first = controller.begin();
    const second = controller.begin();

    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
  });
});

describe('isCapturing', () => {
  it('recognizes microphone-owning phases only', () => {
    expect(isCapturing('starting')).toBe(true);
    expect(isCapturing('recording')).toBe(true);
    expect(isCapturing('stopping')).toBe(true);
    expect(isCapturing('processing')).toBe(false);
    expect(isCapturing('error')).toBe(false);
  });
});

describe('retryAction', () => {
  it('resubmits the same take after a failed transcription instead of recording again', () => {
    expect(retryAction('error', true)).toBe('resubmit')
    expect(retryAction('error', false)).toBe('record')
    expect(retryAction('idle', true)).toBe('record')
  })
})
