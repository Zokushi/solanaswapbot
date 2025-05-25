-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Token" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "logoURI" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Token" ("address", "decimals", "id", "logoURI", "name", "symbol") SELECT "address", "decimals", "id", "logoURI", "name", "symbol" FROM "Token";
DROP TABLE "Token";
ALTER TABLE "new_Token" RENAME TO "Token";
CREATE UNIQUE INDEX "Token_address_key" ON "Token"("address");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
