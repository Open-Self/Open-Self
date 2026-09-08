import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { SENSITIVITY_LEVELS } from './schema.js';

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
        capabilities: z.array(z.enum(['read', 'remember', 'forget'])).max(3),
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
                      capabilities: ['read', 'remember', 'forget'],
                  };
        this.clientId = policy.clientId;
        this.scopes = policy.scopes ? Object.freeze([...policy.scopes]) : undefined;
        this.maxSensitivity = policy.maxSensitivity;
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

    deny() {
        const error = new Error('Access denied by MCP policy');
        error.code = 'ACCESS_DENIED';
        throw error;
    }
}
