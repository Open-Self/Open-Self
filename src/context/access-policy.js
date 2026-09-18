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
        // Policy v2: explicit deny roots win over allow roots — a scope under a
        // denied root is refused even when a broader allow root would cover it.
        deny: z.array(scope).max(50).optional(),
        maxSensitivity: z.enum(SENSITIVITY_LEVELS),
        // Policy v2: requester trust floor — context below this trust rank is
        // never selected for this client, regardless of the request.
        minSourceTrust: z.enum(SOURCE_TRUST_LEVELS).optional(),
        capabilities: z.array(z.enum(MCP_CAPABILITIES)).max(MCP_CAPABILITIES.length),
        // Highest source trust this client's writes may claim. Agent-supplied
        // memories default to `external`; an owner can raise this deliberately.
        maxSourceTrust: z.enum(SOURCE_TRUST_LEVELS).default('external'),
        // Optional requester metadata + default compilation budget ceilings.
        label: z.string().trim().min(1).max(120).optional(),
        transport: z.enum(['stdio', 'http', 'api', 'dashboard']).optional(),
        budget: z
            .object({
                maxChars: z.number().int().min(500).max(200_000).optional(),
                maxTokens: z.number().int().min(100).max(100_000).optional(),
                maxItems: z.number().int().min(1).max(200).optional(),
            })
            .strict()
            .optional(),
    })
    .strict();
const fileSchemaV1 = z
    .object({
        version: z.literal(1),
        clients: z.record(clientId, clientPolicy),
    })
    .strict();
const fileSchemaV2 = z
    .object({
        version: z.literal(2),
        clients: z.record(clientId, clientPolicy),
    })
    .strict();

export function loadMcpPolicy(path, id) {
    clientId.parse(id);
    let parsed;
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        parsed = raw?.version === 2 ? fileSchemaV2.parse(raw) : fileSchemaV1.parse(raw);
    } catch {
        throw new Error('Unable to load MCP policy: file must be valid policy version 1 or 2');
    }
    if (!Object.hasOwn(parsed.clients, id))
        throw new Error('MCP client is not configured in this policy');
    return { clientId: id, ...parsed.clients[id] };
}

/** List every configured requester identity in a policy file. */
export function listMcpPolicyClients(path) {
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        const parsed = raw?.version === 2 ? fileSchemaV2.parse(raw) : fileSchemaV1.parse(raw);
        return Object.keys(parsed.clients);
    } catch {
        return [];
    }
}

/**
 * A requester identity and its context firewall. The envelope is configured by
 * the owner — a request can only ever narrow it, never widen it.
 */
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
        this.label = policy.label;
        this.transport = policy.transport;
        this.scopes = policy.scopes ? Object.freeze([...policy.scopes]) : undefined;
        this.deniedScopes = policy.deny ? Object.freeze([...policy.deny]) : undefined;
        this.maxSensitivity = policy.maxSensitivity;
        this.minSourceTrust = policy.minSourceTrust || 'untrusted';
        this.maxSourceTrust = policy.maxSourceTrust;
        this.capabilities = Object.freeze([...policy.capabilities]);
        this.budget = policy.budget ? Object.freeze({ ...policy.budget }) : undefined;
        Object.freeze(this);
    }

    require(capability) {
        if (!this.capabilities.includes(capability)) this.deny();
    }

    /** True when `scopeValue` sits under an explicitly denied root. */
    denies(scopeValue) {
        if (typeof scopeValue !== 'string' || !this.deniedScopes) return false;
        return this.deniedScopes.some(
            (root) => scopeValue === root || scopeValue.startsWith(`${root}/`),
        );
    }

    contains(scopeValue) {
        if (typeof scopeValue !== 'string' || this.denies(scopeValue)) return false;
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

    /**
     * Compute the effective read envelope for a request: the request may only
     * narrow the configured ceiling — sensitivity is clamped down, the trust
     * floor is clamped up, and denied/forbidden scopes are refused outright.
     */
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
        const floor = SOURCE_TRUST_LEVELS.indexOf(this.minSourceTrust);
        const requestedTrust = input.minSourceTrust
            ? SOURCE_TRUST_LEVELS.indexOf(input.minSourceTrust)
            : -1;
        if (input.minSourceTrust && requestedTrust < 0) this.deny();
        const minSourceTrust = SOURCE_TRUST_LEVELS[Math.max(floor, requestedTrust)];
        return {
            ...input,
            maxSensitivity: maximum,
            minSourceTrust,
            allowedScopes: this.scopes,
            deniedScopes: this.deniedScopes,
        };
    }

    /**
     * Clamp a requested compilation budget to the configured ceilings. Any
     * unit the owner configured becomes a hard maximum; unconfigured units
     * pass through with system bounds applied by the compiler.
     */
    clampBudget(requested = {}) {
        const ceiling = this.budget || {};
        const clampUnit = (unit, fallback) => {
            const requestValue = requested[unit];
            const ceilingValue = ceiling[unit];
            if (ceilingValue === undefined) {
                return requestValue === undefined ? fallback : requestValue;
            }
            return requestValue === undefined ? ceilingValue : Math.min(requestValue, ceilingValue);
        };
        return {
            maxChars: clampUnit('maxChars', undefined),
            maxTokens: clampUnit('maxTokens', undefined),
            maxItems: clampUnit('maxItems', undefined),
        };
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
