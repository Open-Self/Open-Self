/**
 * CLI Error Handler — exit code mapping (P1)
 * NO_SOUL → exit 2, MISSING_API_KEY → exit 2, ECONNREFUSED → exit 3, generic → exit 1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleError, wrapAction } from '../../../src/cli/utils/error-handler.js';

describe('handleError exit codes', () => {
    let exitSpy;
    let consoleErrorSpy;

    beforeEach(() => {
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('exits with code 2 for NO_SOUL error code', () => {
        const err = new Error('SOUL.md not found');
        err.code = 'NO_SOUL';
        expect(() => handleError(err)).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it('exits with code 2 for SOUL.md not found message', () => {
        const err = new Error('SOUL.md not found at ./data');
        expect(() => handleError(err)).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it('exits with code 2 for MISSING_API_KEY error code', () => {
        const err = new Error('API key is missing');
        err.code = 'MISSING_API_KEY';
        expect(() => handleError(err)).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it('exits with code 2 for "api key not set" message pattern', () => {
        const err = new Error('api key not set for provider');
        expect(() => handleError(err)).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it('exits with code 3 for ECONNREFUSED error code', () => {
        const err = new Error('connect ECONNREFUSED 127.0.0.1:11434');
        err.code = 'ECONNREFUSED';
        expect(() => handleError(err)).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(3);
    });

    it('exits with code 3 for ECONNREFUSED in message', () => {
        const err = new Error('ECONNREFUSED connecting to ollama');
        expect(() => handleError(err)).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(3);
    });

    it('exits with code 2 for ENOENT message', () => {
        const err = new Error('ENOENT: no such file or directory');
        expect(() => handleError(err)).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it('exits with code 1 for generic/unknown errors', () => {
        const err = new Error('something went wrong');
        expect(() => handleError(err)).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('handles non-Error objects (string)', () => {
        expect(() => handleError('plain string error')).toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

describe('wrapAction', () => {
    let exitSpy;
    let consoleErrorSpy;

    beforeEach(() => {
        exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('calls the wrapped function normally on success', async () => {
        const fn = vi.fn().mockResolvedValue('ok');
        const wrapped = wrapAction(fn);
        await wrapped('arg1', 'arg2');
        expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('calls handleError when wrapped function throws', async () => {
        const err = new Error('SOUL.md not found');
        err.code = 'NO_SOUL';
        const fn = vi.fn().mockRejectedValue(err);
        const wrapped = wrapAction(fn);
        await expect(wrapped()).rejects.toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(2);
    });
});
