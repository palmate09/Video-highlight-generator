/**
 * Global fix for BigInt serialization in JSON.stringify
 * This is required for Express to handle Prisma models with BigInt fields.
 */
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};
