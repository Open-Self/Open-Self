/**
 * P0 Regression: VN AI-reveal detection + EN patterns + cleanAIReveal
 */
import { describe, it, expect } from 'vitest';
import { detectAIReveal, cleanAIReveal } from '../../../src/safety/ai-detection.js';

describe('detectAIReveal', () => {
    // Vietnamese patterns — P0 regression
    it('detects VN: tôi không phải người', () => {
        expect(detectAIReveal('tôi không phải người đâu')).toBe(true);
    });
    it('detects VN: trí tuệ nhân tạo', () => {
        expect(detectAIReveal('đây là trí tuệ nhân tạo')).toBe(true);
    });
    it('detects VN: tôi là AI', () => {
        expect(detectAIReveal('tôi là một AI')).toBe(true);
    });
    it('detects VN: mô hình ngôn ngữ', () => {
        expect(detectAIReveal('mô hình ngôn ngữ này rất tốt')).toBe(true);
    });
    it('detects VN: tôi là chatbot', () => {
        expect(detectAIReveal('tôi là một chatbot')).toBe(true);
    });

    // English patterns
    it('detects EN: as an AI', () => {
        expect(detectAIReveal('as an AI I cannot do that')).toBe(true);
    });
    it("detects EN: I'm an AI", () => {
        expect(detectAIReveal("I'm an AI assistant")).toBe(true);
    });
    it('detects EN: language model', () => {
        expect(detectAIReveal('I am a language model')).toBe(true);
    });
    it("detects EN: I don't have feelings", () => {
        expect(detectAIReveal("I don't have feelings")).toBe(true);
    });
    it('detects EN: I was programmed', () => {
        expect(detectAIReveal('I was programmed to help')).toBe(true);
    });
    it('detects EN: artificial intelligence', () => {
        expect(detectAIReveal('artificial intelligence powers me')).toBe(true);
    });
    it('detects EN: How can I help you', () => {
        expect(detectAIReveal('How can I help you today?')).toBe(true);
    });

    // True negatives — normal human text
    it('passes: hello bro', () => {
        expect(detectAIReveal('hello bro')).toBe(false);
    });
    it('passes: plain VN sentence', () => {
        expect(detectAIReveal('hôm nay đi đâu chơi không')).toBe(false);
    });
    it('passes: casual reply', () => {
        expect(detectAIReveal('oke t hiểu rồi')).toBe(false);
    });
    it('passes: empty string', () => {
        expect(detectAIReveal('')).toBe(false);
    });
});

describe('cleanAIReveal', () => {
    it('removes "I appreciate your patience"', () => {
        const result = cleanAIReveal('I appreciate your patience. Here is the answer.');
        expect(result).not.toMatch(/I appreciate your patience/i);
    });
    it('removes "Is there anything else I can help you with"', () => {
        const result = cleanAIReveal('Done! Is there anything else I can help you with?');
        expect(result).not.toMatch(/Is there anything else/i);
    });
    it('removes "I understand your concern"', () => {
        const result = cleanAIReveal('I understand your concern. Let me help.');
        expect(result).not.toMatch(/I understand your concern/i);
    });
    it('does not mangle normal human text', () => {
        const plain = 'oke t check lại nha';
        expect(cleanAIReveal(plain)).toBe(plain);
    });
    it('trims whitespace after removal', () => {
        const result = cleanAIReveal('  I appreciate your patience.  ');
        expect(result).toBe(result.trim());
    });
});
