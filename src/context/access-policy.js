import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { SENSITIVITY_LEVELS, SOURCE_TRUST_LEVELS } from './schema.js';

export const MCP_CAPABILITIES = ['read', 'remember', 'forget', 'propose'];

const clientId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const scope = z
    .string()
    .min(1)
    .max(200)
    .refine(
        (value) =>
            value === value.trim() &&
            !value.split('/').some((part) => !part || part === '.' || part === '..'),
    );
const clientPolicy = z
    .object({
        scopes: z.array(scope).min(1).max(50),
        maxSensitivity: z.enum(SENSITIVITY_LEVELS),
        capabilities: z.array(z.enum(MCP_CAPABILITIES)).max(MCP_CAPABILITIES.length),
        // Highest source trust this client's writes may claim. Agent-supplied
        // memories default to `external`; an owner can raise this deliberately.
        maxSourceTrust: z.enum(SOURCE_TRUST_LEVELS).default('external'),
    })
    .strict();
const fileSchema = z
    .object({
        version: z.literal(1),
        clients: z.record(clientId, clientPolicy),
    })
    .strict();

export function loadMcpPolicy(path, id) {
    clientId.parse(id);
    let parsed;
    try {
        parsed = fileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
        throw new Error('Unable to load MCP policy: file must be valid policy version 1');
    }
    if (!Object.hasOwn(parsed.clients, id))
        throw new Error('MCP client is not configured in this policy');
    return { clientId: id, ...parsed.clients[id] };
}

export class AccessPolicy {
    constructor(input) {
        const policy =
            input !== undefined
                ? {
                      clientId: clientId.parse(input.clientId),
                      ...clientPolicy.parse(
                          Object.fromEntries(
                              Object.entries(input).filter(([key]) => key !== 'clientId'),
                          ),
                      ),
                  }
                : {
                      clientId: 'trusted-local',
                      scopes: undefined,
                      maxSensitivity: 'private',
                      capabilities: ['read', 'remember', 'forget', 'propose'],
                      maxSourceTrust: 'external',
                  };
        this.clientId = policy.clientId;
        this.scopes = policy.scopes ? Object.freeze([...policy.scopes]) : undefined;
        this.maxSensitivity = policy.maxSensitivity;
        this.maxSourceTrust = policy.maxSourceTrust;
        this.capabilities = Object.freeze([...policy.capabilities]);
        Object.freeze(this);
    }

    require(capability) {
        if (!this.capabilities.includes(capability)) this.deny();
    }

    contains(scopeValue) {
        if (typeof scopeValue !== 'string') return false;
        return (
            this.scopes === undefined ||
            this.scopes.some((root) => scopeValue === root || scopeValue.startsWith(`${root}/`))
        );
    }

    requireMemory(memory) {
        if (
            !memory ||
            !this.contains(memory.scope) ||
            !SENSITIVITY_LEVELS.includes(memory.sensitivity) ||
            SENSITIVITY_LEVELS.indexOf(memory.sensitivity) >
                SENSITIVITY_LEVELS.indexOf(this.maxSensitivity)
        )
            this.deny();
    }

    readOptions(input) {
        const requested = input.maxSensitivity || this.maxSensitivity;
        if (!SENSITIVITY_LEVELS.includes(requested)) this.deny();
        const maximum =
            SENSITIVITY_LEVELS[
                Math.min(
                    SENSITIVITY_LEVELS.indexOf(requested),
                    SENSITIVITY_LEVELS.indexOf(this.maxSensitivity),
                )
            ];
        if (input.scope && !this.contains(input.scope)) this.deny();
        return { ...input, maxSensitivity: maximum, allowedScopes: this.scopes };
    }

    /**
     * Clamp a requested source-trust claim to this client's ceiling. A client
     * can always write lower-trust memories; it can never claim more trust
     * than the owner granted.
     */
    clampSourceTrust(requested) {
        const value = requested || 'external';
        if (!SOURCE_TRUST_LEVELS.includes(value)) this.deny();
        const ceiling = this.maxSourceTrust || 'external';
        return SOURCE_TRUST_LEVELS.indexOf(value) <= SOURCE_TRUST_LEVELS.indexOf(ceiling)
            ? value
            : ceiling;
    }

    deny() {
        const error = new Error('Access denied by MCP policy');
        error.code = 'ACCESS_DENIED';
        throw error;
    }
}
